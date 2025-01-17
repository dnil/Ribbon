// =============================================================================
// Initialize Aioli
// =============================================================================

import Aioli from "@biowasm/aioli";
import { user_message_ribbon } from "./index_ribbon";

// Create Aioli (and the WebWorker in which WASM code will run).
// Load assets locally instead of using the CDN.
const urlPrefix = `${window.location.origin}/wasm`;
export let CLI;
new Aioli([
  { tool: "samtools", version: "1.17", urlPrefix },
  { tool: "bcftools", version: "1.10", urlPrefix },
]).then(async (cli) => {
  CLI = cli;
  console.log("Loaded Aioli with:");
  console.log("- samtools", await CLI.exec("samtools --version-only"));
  console.log("- bcftools", await CLI.exec("bcftools --version-only"));
});

// =============================================================================
// Classes for managing genomic files
// =============================================================================

class GenomicFile {
  format; // genomics file format
  files = []; // array of File objects or URLs
  paths = []; // paths where those files are mounted
  ready = false;

  constructor(files) {
    this.files = files;
  }

  async mount() {
    this.paths = await CLI.mount(this.files);
  }

  async parseHeader() {
    throw Error(`Not implemented for format "${this.format}"`);
  }

  async fetch(chrom, start, end) {
    throw Error(`Not implemented for format "${this.format}"`);
  }
}

// BAM file utilities
export class BamFile extends GenomicFile {
  // files = []; // [bam, index]
  // paths = []; // [/bla/bam, /bla/index]
  format = "bam";
  header = {
    raw: "",
    sq: [],
  };

  async mount() {
    await super.mount();

    // Ignore if not a URL
    if(this.files[0] instanceof File) {
      return;
    }

    // Download BAI in one go so it's faster than downloading it 1 MB at a time when lazy mount a URL with Aioli
    const bam_url = this.files[0];
    const bai_url = bam_url + ".bai";
    let blob;
    try {
      blob = await fetch(bai_url).then(d => d.blob());
    } catch (error) {
      alert(`Could not download this URL:\n\n${bai_url}`);
      throw new Error(error);
    }

    // Mount BAI
    const file_name = this.paths[0].replace("/shared/data/", "") + ".bai";
    const [bai_path] = await CLI.mount([{
      name: file_name,
      data: blob
    }]);
    this.paths[1] = bai_path;
    console.log("Mounted index:", bai_path);
  }

  async parseHeader() {
    const raw = await CLI.exec(`samtools view -H ${this.paths[0]}`);
    if (!raw) {
      console.error(
        "No header found when running `samtools view -H` This may not be a valid BAM file."
      );
      return;
    }

    this.header = {
      sq: parseBamHeader(raw),
    };
    this.ready = true;
    return this.header;
  }

  async fetch(chrom, start, end) {
    if (!this.header.sq.find((d) => d.name === chrom)) {
      user_message_ribbon("Warning", `Reference sequence "${chrom}" was not found in the header of the BAM. Note that chr prefix must be consistent across files.`);
      console.warn(`Reference sequence "${chrom}" was not found in the header of the BAM. Note that chr prefix must be consistent across files.`);
        return [];
    }

    const region = `${chrom}:${start}-${end}`;
    let subsampling = "";

    // Use "samtools coverage" to estimate how many bases we would need to load (in contrast,
    // using "samtools view -c" would only tell us the number of reads, which is misleading
    // for long-read data!). This is generally much much faster than trying to load the region
    // so for most cases, the additional runtime is negligible.
    console.time(`samtools coverage ${region}`);
    const coverage = await CLI.exec(
      `samtools coverage ${this.paths[0]} -r ${region} --no-header`
    );
    console.timeEnd(`samtools coverage ${region}`);

    // Estimate how much data we're looking at in the selected region, and subsample if
    // the user is trying to load too much data. Col #5 = "covbases", Col #7 = "meandepth".
    // See http://www.htslib.org/doc/samtools-coverage.html for documentation.
    const stats = coverage.split("\t");
    let samplingPct = Math.round((1e6 / (+stats[4] * +stats[6])) * 100) / 100;
    if (samplingPct < 1 && _automation_running && !automation_subsample) {
      if (!_automation_running) {
        samplingPct = prompt(
          `⚠️ Warning\n\nThis region contains a lot of data and may crash your browser.\n\nEnter the fraction of reads to sample (use the default if you're not sure):`,
          samplingPct
        );
      }
      subsampling = ` -s ${samplingPct}`;
      console.warn(
        `Region contains a lot of data; sampling ${Math.round(
          samplingPct * 100
        )}% of reads.`
      );
    }

    // Stream the SAM output to a temporary file on the virtual filesystem inside the WebWorker.
    // The alternative is to append each line output to Aioli's STDOUT variable, which involves
    // converting bytes to strings each time, as opposed to doing it once at the end when we call
    // CLI.cat(). Based on a few tests run on Illumina and PacBio data, using the command
    // "samtools view -o" followed by "cat" is ~2-3X faster than simply using "samtools view".
    console.time(`samtools view ${region}`);
    let std_err_samtools = await CLI.exec(
      `samtools view${subsampling} -o /tmp/reads.sam ${this.paths[0]} ${region}`
    );
    if (std_err_samtools.includes("[E::")) {
      console.error(std_err_samtools);
    }

    const raw = await CLI.cat("/tmp/reads.sam");
    console.timeEnd(`samtools view ${region}`);

    if (!raw) {
      console.warn("No reads in the bam file at this location");
      return [];
    }

    return parseBamReads(raw);
  }
}

// =============================================================================
// Bioinformatics parsing utilities
// =============================================================================

// Parse SQ headers
function parseBamHeader(raw) {
  return raw
    .trim()
    .split("\n")
    .filter((d) => d.startsWith("@SQ"))
    .map((d) => {
      const info = d
        .split("\t")
        .filter((d) => d.startsWith("SN:") || d.startsWith("LN:"))
        .map((d) => d.replace(/SN:|LN:/g, ""));

      return { name: info[0], end: +info[1] + 1 };
    });
}

// Parse BAM reads
function parseBamReads(raw) {
  return raw
    .trim()
    .split("\n")
    .map((read) => {
      const readInfo = read.split("\t");
      const record = {
        readName: readInfo[0],
        flag: +readInfo[1],
        segment: readInfo[2],
        pos: +readInfo[3],
        mq: +readInfo[4],
        cigar: readInfo[5],
      };

      // Parse SA tag: In the SAM format, tags start at index 11
      for (let i = 11; i < readInfo.length; i++) {
        if (readInfo[i].startsWith("SA:")) {
          record.SA = readInfo[i].split(":")[2];
        }
        if (readInfo[i].startsWith("HP:")) {
          record.HP = readInfo[i].split(":")[2];
        }
      }

      return record;
    });
}
