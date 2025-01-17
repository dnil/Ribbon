import * as d3 from "d3";
import moment from "moment"
import { BamFile } from "./file_parsing";
import { download, exportViz, wait_for_aioli } from "./utils.js";
import Livesearch from "./d3-livesearch.js";
import SuperTable from "./d3-superTable.js";
import pako from "pako";
import { user_message } from "./user_message.js";

// URLs
var URL_API_STORE = "https://api.genomeribbon.com/v0/store/";

// Calculations for drawing and spacing out elements on the screen
var _ribbon_padding = {};
var _layout = {};
var _positions = {};
_positions.multiread = {};
_positions.singleread = {};
_positions.ribbonplot = {};
_positions.dotplot = {};
_positions.fontsize = 12;

// Elements on the page
var _ribbon_svg1;

var _ribbon_svg2; // for read selection

// Data for visualization
var _current_read_index = 0;

var _Chunk_alignments = [];
var _Alignments = [];
var _Ref_intervals = [];
var _Chunk_ref_intervals = [];
var _Whole_refs = [];
var _Refs_show_or_hide = {};
var _Variants = [];
var _Bedpe = [];
var _Additional_ref_intervals = [];
var _Features_for_ribbon = [];

var _focal_region; // {chrom,start,end}:  one region that the bam file, variants, or majority of reads from a sam entry point towards, considered the primary region for read alignment

// Reading bam file
var _Bams = undefined;
var _Ref_sizes_from_header = {};
var _ui_done_loading_bam = false;

// Selecting region
var _region = {}; // chrom, start, end

// Various global variables to capture UI settings and static variables
var _ribbon_static = {};
_ribbon_static.alignment_alpha = 0.5;
_ribbon_static.dotplot_ref_opacity = 0.5;

_ribbon_static.fraction_ref_to_show_whole = 0.3; //  for very large contigs that span most of a reference, we show the whole reference
_ribbon_static.read_sort_options = [
  { id: "original", description: "Original order" },
  { id: "longest", description: "Position of longest alignment" },
  {
    id: "primary",
    description: "Position of primary alignment in SAM/BAM entry",
  },
  { id: "readname", description: "Read/query name (natural sort)" },
  { id: "num_alignments", description: "Number of alignments" },
  { id: 'HP', description: 'Haplotype phasing (HP)' },
  { id: 'bam', description: "Group by bam file" }
];

_ribbon_static.read_orientation_options = [
  { id: "original", description: "Original strand" },
  { id: "longest", description: "Orientation of longest alignment" },
  {
    id: "primary",
    description: "Orientation of alignment in selected locus (SAM/BAM)",
  },
];
_ribbon_static.color_alignments_by_options = [
  { id: 'strand', description: 'Strand (actual strand from data)' },
  { id: 'orientation', description: 'Orientation (from "Orient reads by")' },
  { id: 'HP', description: 'Haplotype phasing (HP) (1=orange, 2=green)' },
  { id: 'bam', description: 'Which BAM file each read came from' }
];

_ribbon_static.color_schemes = [
  { name: "Color scheme 1", colors: 0 },
  { name: "Color scheme 2", colors: 1 },
  { name: "Color scheme 3", colors: 2 },
];
_ribbon_static.color_collections = [
  [
    "#ff9896",
    "#c5b0d5",
    "#8c564b",
    "#e377c2",
    "#bcbd22",
    "#9edae5",
    "#c7c7c7",
    "#d62728",
    "#ffbb78",
    "#98df8a",
    "#ff7f0e",
    "#f7b6d2",
    "#c49c94",
    "#dbdb8d",
    "#aec7e8",
    "#17becf",
    "#2ca02c",
    "#7f7f7f",
    "#1f77b4",
    "#9467bd",
  ],
  [
    "#ffff00",
    "#ad0000",
    "#bdadc6",
    "#00ffff",
    "#e75200",
    "#de1052",
    "#ffa5a5",
    "#7b7b00",
    "#7bffff",
    "#008c00",
    "#00adff",
    "#ff00ff",
    "#ff0000",
    "#ff527b",
    "#84d6a5",
    "#e76b52",
    "#8400ff",
    "#6b4242",
    "#52ff52",
    "#0029ff",
    "#ffffad",
    "#ff94ff",
    "#004200",
    "gray",
    "black",
  ],
  [
    "#E41A1C",
    "#A73C52",
    "#6B5F88",
    "#3780B3",
    "#3F918C",
    "#47A266",
    "#53A651",
    "#6D8470",
    "#87638F",
    "#A5548D",
    "#C96555",
    "#ED761C",
    "#FF9508",
    "#FFC11A",
    "#FFEE2C",
    "#EBDA30",
    "#CC9F2C",
    "#AD6428",
    "#BB614F",
    "#D77083",
    "#F37FB8",
    "#DA88B3",
    "#B990A6",
    "#999999",
  ],
];
_ribbon_static.min_indel_size_for_region_view = 50;
_ribbon_static.show_indels_as_options = [
  { id: "none", description: "None" },
  { id: "gaps", description: "Gaps" },
  { id: "thin", description: "Marks" },
  { id: "numbers", description: "Numbers indicating size" },
];
_ribbon_static.show_features_as_options = [
  { id: "none", description: "None" },
  { id: "rectangles", description: "Boxes" },
  { id: "arrows", description: "Arrows" },
  { id: "names", description: "Arrows with names" },
];
_ribbon_static.multiread_layout_fractions = {
  header: 0.25,
  footer: 0.02,
  variants: 0.1,
  bedpe: 0.05,
  features: 0.07,
};
_ribbon_static.singleread_layout_fractions = {
  ref_and_mapping: 0.33,
  top_bar: 0.07,
  variants: 0.06,
  features: 0.1,
  bottom_bar: 0.03,
};

const LARGE_FILE_THRESHOLD = 10000000; // Above 10 MB we throw a warning.

var _ribbon_settings = {};
_ribbon_settings.region_min_mapping_quality = 0;
_ribbon_settings.max_num_alignments = 1000000;
_ribbon_settings.min_num_alignments = 1;
_ribbon_settings.max_ref_length = 0;
_ribbon_settings.min_aligns_for_ref_interval = 1;
_ribbon_settings.min_read_length = 0;

_ribbon_settings.ribbon_vs_dotplot = "ribbon";
_ribbon_settings.min_mapping_quality = 0;
_ribbon_settings.min_indel_size = _ribbon_static.min_indel_size_for_region_view; // set to -1 to stop showing indels
_ribbon_settings.min_align_length = 0;

_ribbon_settings.color_index = 0;
_ribbon_settings.colorful = true;
_ribbon_settings.ribbon_outline = true;
_ribbon_settings.show_only_known_references = true;
_ribbon_settings.keep_duplicate_reads = false;
_ribbon_settings.feature_to_sort_reads = "original";
_ribbon_settings.orient_reads_by = "primary";
_ribbon_settings.color_alignments_by = "orientation";

_ribbon_settings.current_input_type = "";
_ribbon_settings.ref_match_chunk_ref_intervals = true;
_ribbon_settings.show_only_selected_variants = false;
_ribbon_settings.margin_to_merge_ref_intervals = 10000;
_ribbon_settings.show_indels_as = "thin";
_ribbon_settings.highlight_selected_read = true;
_ribbon_settings.alignment_info_text = "";
_ribbon_settings.variant_info_text = "";
_ribbon_settings.bam_url = undefined;
_ribbon_settings.fetch_margin = 100;
_ribbon_settings.show_features_as = "names";
_ribbon_settings.feature_types_to_show = { protein_coding: true };
_ribbon_settings.single_chrom_highlighted = false;
_ribbon_settings.bam_fetch_margin = 100;
_ribbon_settings.draw_focus_rectangle = true;

// For paired end reads:
_ribbon_settings.paired_end_mode = false;
_ribbon_settings.flip_second_read_in_pair = true; // allow user to change this
_ribbon_settings.read_pair_spacing = 20; // allow user to change this

// Automation
_ribbon_settings.automation_mode = true;
_ribbon_settings.automation_reads_split_near_variant_only = true;
_ribbon_settings.automation_margin_for_split = 1000;
_ribbon_settings.automation_max_reads_to_screenshot = 5;
_ribbon_settings.automation_subsample = true;

_ribbon_settings.add_coordinates_to_figures = false;

_ribbon_settings.automation_download_info = true;
_ribbon_settings.selected_bedpe_text = "";

var _ui_properties = {};
_ui_properties.region_mq_slider_max = 0;
_ui_properties.region_mq_slider_min = 0;
_ui_properties.num_alignments_slider_max = 1000000;
_ui_properties.ref_length_slider_max = 10;
_ui_properties.read_length_slider_max = 10;

_ui_properties.mq_slider_max = 0;
_ui_properties.indel_size_slider_max = 0;
_ui_properties.align_length_slider_max = 0;

// Scales for visualization
var _ribbon_scales = {};
_ribbon_scales.read_scale = d3.scaleLinear();
_ribbon_scales.whole_ref_scale = d3.scaleLinear();
_ribbon_scales.chunk_whole_ref_scale = d3.scaleLinear();
_ribbon_scales.ref_interval_scale = d3.scaleLinear();
_ribbon_scales.chunk_ref_interval_scale = d3.scaleLinear();
_ribbon_scales.ref_color_scale = d3.scaleOrdinal()
  .range(_ribbon_static.color_collections[_ribbon_settings.color_index]);
_ribbon_scales.variant_color_scale = d3.scaleOrdinal();
_ribbon_scales.feature_color_scale = d3.scaleOrdinal();
_ribbon_scales.HP_color_scale = d3.scaleOrdinal()
  .domain(["1", "2", undefined])
  .range(["#ff7f0e", "#2ca02c", 'gray']); // orange, green
_ribbon_scales.which_BAM_scale = d3.scaleOrdinal()
  .range(d3.schemeCategory10);

// Show each warning only the first time it comes up in a session
var _ribbon_warnings = {};
_ribbon_warnings.pe_mode = false;
_ribbon_warnings.large_features = false;

var _ribbon_tooltip = {};
function show_ribbon_tooltip(text, x, y, parent_object) {
  parent_object.selectAll("g.tip").remove();

  _ribbon_tooltip.width = (text.length + 4) * (_layout.svg_width / 100);
  _ribbon_tooltip.height = _layout.svg_height / 20;

  if (x - _ribbon_tooltip.width / 2 < 0) {
    x = _ribbon_tooltip.width / 2;
  } else if (x + _ribbon_tooltip.width / 2 > parent_object.attr("width")) {
    x = parent_object.attr("width") - _ribbon_tooltip.width / 2;
  }
  if (y - _ribbon_tooltip.height / 2 < 0) {
    y = _ribbon_tooltip.height / 2;
  } else if (y + _ribbon_tooltip.height / 2 > parent_object.attr("height")) {
    y = parent_object.attr("height") - _ribbon_tooltip.height / 2;
  }
  _ribbon_tooltip.g = parent_object.append("g").attr("class", "tip");
  _ribbon_tooltip.g
    .attr("transform", "translate(" + x + "," + y + ")")
    .style("visibility", "visible");

  _ribbon_tooltip.rect = _ribbon_tooltip.g
    .append("rect")
    .attr("width", _ribbon_tooltip.width)
    .attr("x", -_ribbon_tooltip.width / 2)
    .attr("height", _ribbon_tooltip.height)
    .attr("y", -_ribbon_tooltip.height / 2)
    .attr("fill", "black");

  _ribbon_tooltip.tip = _ribbon_tooltip.g.append("text");
  _ribbon_tooltip.tip
    .text(text)
    .attr("fill", "white")
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "middle");
}

function resize_ribbon_views() {
  var w = window,
    d = document,
    e = d.documentElement,
    g = d.getElementsByTagName("body")[0];

  var window_width;
  var window_height;

  window_width = (w.innerWidth || e.clientWidth || g.clientWidth) * 0.98;
  window_height = (w.innerHeight || e.clientHeight || g.clientHeight) * 0.96;

  var top_banner_size = 60;
  _ribbon_padding.top = top_banner_size;
  _ribbon_padding.bottom = 0;
  _ribbon_padding.left = 0;
  _ribbon_padding.right = 0;
  _ribbon_padding.between = 0.01 * window_height;
  _ribbon_padding.text = _ribbon_padding.between;
  _ribbon_padding.between_top_and_bottom_svg = _ribbon_padding.between * 2;

  _layout.right_panel_fraction = 0.35;
  _layout.svg_width_fraction = 1 - _layout.right_panel_fraction;

  _layout.svg1_height_fraction = 0.4;

  _layout.left_width =
    (window_width - _ribbon_padding.left - _ribbon_padding.right) *
    (1 - _layout.right_panel_fraction);
  _layout.panel_width =
    (window_width - _ribbon_padding.left - _ribbon_padding.right) *
    _layout.right_panel_fraction;

  _layout.svg1_box_height =
    (window_height - _ribbon_padding.top - _ribbon_padding.bottom) *
    _layout.svg1_height_fraction;
  _layout.svg2_box_height =
    (window_height - _ribbon_padding.top - _ribbon_padding.bottom) *
    (1 - _layout.svg1_height_fraction);
  _layout.total_height =
    window_height - _ribbon_padding.top - _ribbon_padding.bottom;

  _layout.svg_width = _layout.left_width - _ribbon_padding.between * 4;
  _layout.svg_height =
    _layout.svg1_box_height - _ribbon_padding.between_top_and_bottom_svg;

  _layout.svg2_width = _layout.left_width - _ribbon_padding.between * 4;
  _layout.svg2_height =
    _layout.svg2_box_height - _ribbon_padding.between_top_and_bottom_svg;

  _layout.input_margin = _ribbon_padding.between;

  _positions.fontsize = _layout.svg2_width * 0.012;

  d3.select("#svg1_panel")
    .style("width", _layout.left_width + "px")
    .style("height", _layout.svg1_box_height + "px");

  d3.select("#svg2_panel")
    .style("width", _layout.left_width + "px")
    .style("height", _layout.svg2_box_height + "px");

  d3.select("#right_panel")
    .style("width", _layout.panel_width + "px")
    .style("height", _layout.total_height + "px")
    .style("visibility", "visible");

  d3.select("#advanced_settings_panel").style(
    "width",
    _layout.svg2_width + "px"
  );

  if (_Chunk_alignments.length > 0 || _Whole_refs.length > 0) {
    draw_region_view();
    draw();
  }
  refresh_visibility();
}

function adjust_multiread_layout() {
  var remaining_fraction_for_reads =
    1.0 -
    _ribbon_static.multiread_layout_fractions["header"] -
    _ribbon_static.multiread_layout_fractions["footer"];
  var fractional_pos_for_variants = 0;
  var fractional_pos_for_features = 0;

  if (_Variants.length > 0 || _Bedpe.length > 0) {
    remaining_fraction_for_reads -=
      _ribbon_static.multiread_layout_fractions["variants"];
  }
  if (_Features_for_ribbon.length > 0) {
    remaining_fraction_for_reads -=
      _ribbon_static.multiread_layout_fractions["features"];
  }
  _positions.multiread.ref_intervals = {
    y:
      _layout.svg2_height * _ribbon_static.multiread_layout_fractions["header"],
    height: _layout.svg2_height * remaining_fraction_for_reads,
    x: _layout.svg2_width * 0.05,
    width: _layout.svg2_width * 0.9,
  };
  _positions.multiread.reads = {
    top_y: _positions.multiread.ref_intervals.y,
    height: _positions.multiread.ref_intervals.height,
    x: _positions.multiread.ref_intervals.x,
    width: _positions.multiread.ref_intervals.width,
  };

  fractional_pos_for_variants =
    _ribbon_static.multiread_layout_fractions["header"] +
    remaining_fraction_for_reads;
  if (_Variants.length > 0 || _Bedpe.length > 0) {
    fractional_pos_for_features =
      fractional_pos_for_variants +
      _ribbon_static.multiread_layout_fractions["variants"];
  } else {
    fractional_pos_for_features = fractional_pos_for_variants;
  }
  _positions.multiread.variants = {
    y: _layout.svg2_height * fractional_pos_for_variants,
    rect_height:
      _layout.svg2_height *
      _ribbon_static.multiread_layout_fractions["variants"] *
      0.9,
    ankle_height: _layout.svg2_height * 0.015,
    bezier_height:
      _layout.svg2_height *
      _ribbon_static.multiread_layout_fractions["variants"] *
      0.9,
    foot_length:
      (_layout.svg2_height *
        _ribbon_static.multiread_layout_fractions["variants"]) /
      5,
    arrow_size:
      (_layout.svg2_height *
        _ribbon_static.multiread_layout_fractions["variants"]) /
      20,
  };
  _positions.multiread.features = {
    y: _layout.svg2_height * fractional_pos_for_features,
    rect_height:
      _layout.svg2_height *
      _ribbon_static.multiread_layout_fractions["features"],
    arrow_size:
      (_layout.svg2_height *
        _ribbon_static.multiread_layout_fractions["features"]) /
      7,
  };
}

function getUrlVars() {
  var vars = {};
  var parts = window.location.href.replace(
    /[?&]+([^=&]+)=([^&]*)/gi,
    function (m, key, value) {
      vars[key] = value;
    }
  );
  return vars;
}

function check_url_for_permalink() {
  var url_vars = getUrlVars();
  if (url_vars["perma"] != undefined) {
    wait_for_aioli(() => {
      read_permalink(url_vars["perma"]);
    })
  }
}

//////////////////// Region settings /////////////////////////
$("#region_mq_slider").slider({
  min: 0,
  max: 1000,
  slide: function (event, ui) {
    $("#region_mq_label").html(ui.value);
    _ribbon_settings.region_min_mapping_quality = ui.value;
    draw_region_view();
  },
});

$("#min_read_length_slider").slider({
  min: 0,
  max: 1000,
  slide: function (event, ui) {
    d3.select("#min_read_length_input").property("value", ui.value);
    _ribbon_settings.min_read_length = ui.value;
    draw_region_view();
  },
});

$("#min_aligns_for_ref_interval_slider").slider({
  min: 1,
  max: 20,
  slide: function (event, ui) {
    d3.select("#min_aligns_for_ref_interval_label").html(ui.value);
    _ribbon_settings.min_aligns_for_ref_interval = ui.value;
    apply_ref_filters();
    draw_region_view();
    if (_ribbon_settings.ref_match_chunk_ref_intervals == true) {
      select_read();
    }
  },
});
$("#max_ref_length_slider").slider({
  min: 0,
  max: 1000,
  slide: function (event, ui) {
    d3.select("#max_ref_length_input").property("value", ui.value);
    _ribbon_settings.max_ref_length = ui.value;
    max_ref_length_changed();
    apply_ref_filters();
    if (_ribbon_settings.ref_match_chunk_ref_intervals == true) {
      select_read();
    }
  },
});

$("#num_aligns_range_slider").slider({
  range: true,
  min: 1,
  max: 500,
  values: [100, 300],
  slide: function (event, ui) {
    $("#num_aligns_range_label").html("" + ui.values[0] + " - " + ui.values[1]);
    _ribbon_settings.min_num_alignments = ui.values[0];
    _ribbon_settings.max_num_alignments = ui.values[1];
    draw_region_view();
  },
});

$("#mq_slider").slider({
  min: 0,
  max: 1000,
  slide: function (event, ui) {
    $("#mq_label").html(ui.value);
    _ribbon_settings.min_mapping_quality = ui.value;
    draw();
  },
});

$("#indel_size_slider").slider({
  min: 0,
  max: 1000,
  slide: function (event, ui) {
    $("#indel_size_label").html(ui.value);
    _ribbon_settings.min_indel_size = ui.value;

    _Alignments = reparse_read(
      _Chunk_alignments[_current_read_index]
    ).alignments;
    draw();
  },
});

$("#align_length_slider").slider({
  min: 0,
  max: 1000,
  slide: function (event, ui) {
    $("#align_length_label").html(ui.value);
    _ribbon_settings.min_align_length = ui.value;
    draw();
  },
});

function max_ref_length_changed() {
  for (var i in _Whole_refs) {
    _Refs_show_or_hide[_Whole_refs[i].chrom] =
      _Whole_refs[i].size <= _ribbon_settings.max_ref_length;
  }

  d3.select("#chrom_highlighted").html("by size");
  apply_ref_filters();
  draw_region_view();
}

function search_select_chrom(chrom) {
  // Reset the ref size slider to default
  _ribbon_settings.max_ref_length = _ui_properties.ref_length_slider_max;
  $("#max_ref_length_slider").slider(
    "option",
    "value",
    _ribbon_settings.max_ref_length
  );
  d3.select("#max_ref_length_input").property(
    "value",
    _ribbon_settings.max_ref_length
  );

  highlight_chromosome(chrom);
}

function search_select_read(d) {
  new_read_selected(d.index);
}

d3.select("#min_read_length_input").on("keyup", function () {
  _ribbon_settings.min_read_length = parseInt(this.value);
  if (isNaN(_ribbon_settings.min_read_length)) {
    _ribbon_settings.min_read_length = 0;
  }

  $("#min_read_length_slider").slider(
    "option",
    "value",
    _ribbon_settings.min_read_length
  );
  draw_region_view();
});

d3.select("#max_ref_length_input").on("keyup", function () {
  _ribbon_settings.max_ref_length = parseInt(this.value);
  if (isNaN(_ribbon_settings.max_ref_length)) {
    _ribbon_settings.max_ref_length = 0;
  }

  $("#max_ref_length_slider").slider(
    "option",
    "value",
    _ribbon_settings.max_ref_length
  );
  max_ref_length_changed();
});

d3.select("#bam_fetch_margin").on("keyup", function () {
  _ribbon_settings.bam_fetch_margin = parseInt(this.value);
  if (
    isNaN(_ribbon_settings.bam_fetch_margin) ||
    _ribbon_settings.bam_fetch_margin < 1
  ) {
    _ribbon_settings.bam_fetch_margin = 1;
  }
});

d3.select("#margin_to_merge_ref_intervals").on("keyup", function () {
  _ribbon_settings.margin_to_merge_ref_intervals = parseInt(this.value);
  if (isNaN(_ribbon_settings.margin_to_merge_ref_intervals)) {
    _ribbon_settings.margin_to_merge_ref_intervals = 0;
  }
  organize_references_for_chunk();
  apply_ref_filters();
  draw_region_view();
  select_read();
});

d3.select("#generate_permalink_button").on("click", function () {
  write_permalink();
});

function get_name() {
  var permalink_name = d3.select("#permalink_name").property("value");
  if (permalink_name == "") {
    permalink_name = "Ribbon";
  }
  return permalink_name;
}

async function screenshot_top() {
  await exportViz({
    format: "png",
    element: document.querySelector("#svg_multi_read"),
    filename: `${get_name()}_multi-read.png`,
  });
}

async function screenshot_bottom(read_name = "single-read") {
  await exportViz({
    format: "png",
    element: document.querySelector("#svg_single_read"),
    filename: `${get_name()}_${read_name}.png`,
  });
}

d3.select("#screenshot_top").on("click", screenshot_top);
d3.select("#screenshot_bottom").on("click", screenshot_bottom);

$("#show_all_refs").click(function () {
  show_all_chromosomes();
  apply_ref_filters();
  draw_region_view();
  if (_ribbon_settings.ref_match_chunk_ref_intervals == true) {
    apply_ref_filters();
    select_read();
  }
});

$("#ref_match_region_view").change(function () {
  _ribbon_settings.ref_match_chunk_ref_intervals = this.checked;
  select_read(); // need to recalculate ref intervals
});

$("#colors_checkbox").change(function () {
  _ribbon_settings.colorful = this.checked;
  draw();
});

$("#show_only_selected_variants").change(function () {
  _ribbon_settings.show_only_selected_variants = this.checked;
  draw_region_view();
  draw();
});

$("#highlight_selected_read").change(function () {
  _ribbon_settings.highlight_selected_read = this.checked;
  new_read_selected(_current_read_index);
});

$("#outline_checkbox").change(function () {
  _ribbon_settings.ribbon_outline = this.checked;
  draw();
});

$(".ribbon_vs_dotplot").click(function () {
  var value = d3.select("input[name=ribbon_vs_dotplot]:checked").node().value;
  if (_ribbon_settings.ribbon_vs_dotplot != value) {
    _ribbon_settings.ribbon_vs_dotplot = value;

    // Show settings specific to each plot
    $(".ribbon_settings").toggle();
    $(".dotplot_settings").toggle();

    // Redraw
    draw();
  }
});

function draw_chunk_ref() {
  if (_Whole_refs.length == 0) {
    return;
  }

  _positions.multiread.ref_block = {
    y: _layout.svg2_height * 0.15,
    x: _layout.svg2_width * 0.05,
    width: _layout.svg2_width * 0.9,
    height: _layout.svg2_height * 0.03,
  };
  // Draw "Reference" label
  _ribbon_svg2
    .append("text")
    .attr("id", "ref_tag")
    .text("Reference")
    .attr(
      "x",
      _positions.multiread.ref_block.x +
        _positions.multiread.ref_block.width / 2
    )
    .attr(
      "y",
      _positions.multiread.ref_block.y -
        _positions.multiread.ref_block.height * 3
    )
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", _positions.fontsize);

  // _scales.read_scale.range([_positions.read.x,_positions.read.x+_positions.read.width]);
  _ribbon_scales.chunk_whole_ref_scale.range([
    _positions.multiread.ref_block.x,
    _positions.multiread.ref_block.x + _positions.multiread.ref_block.width,
  ]);

  // Whole reference chromosomes for the relevant references:
  var ref_blocks = _ribbon_svg2
    .selectAll("g.ref_block")
    .data(_Whole_refs)
    .enter()
    .append("g")
    .attr("class", "ref_block")
    .filter(function (d) {
      return _Refs_show_or_hide[d.chrom];
    })
    .attr("transform", function (d) {
      return (
        "translate(" +
        _ribbon_scales.chunk_whole_ref_scale(d.filtered_cum_pos) +
        "," +
        _positions.multiread.ref_block.y +
        ")"
      );
    })
    .on("mouseout", function (d) {
      _ribbon_svg2.selectAll("g.tip").remove();
    })
    .on("click", function (d) {
      highlight_chromosome(d.chrom);
    })
    .on("mouseover", function (d) {
      var text = d.chrom + ": " + bp_format(d.size);
      var x = _ribbon_scales.chunk_whole_ref_scale(
        d.filtered_cum_pos + d.size / 2
      );
      var y = _positions.multiread.ref_block.y - _ribbon_padding.text * 3;
      show_ribbon_tooltip(text, x, y, _ribbon_svg2);
    });

  ref_blocks
    .append("rect")
    .attr("class", "ref_block")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", function (d) {
      return (
        _ribbon_scales.chunk_whole_ref_scale(d.filtered_cum_pos + d.size) -
        _ribbon_scales.chunk_whole_ref_scale(d.filtered_cum_pos)
      );
    })
    .attr("height", _positions.multiread.ref_block.height)
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.chrom);
    })
    .style("stroke-width", 1)
    .style("stroke", "black");

  ref_blocks
    .append("text")
    .attr("class", "ref_block")
    .filter(function (d) {
      return _Refs_show_or_hide[d.chrom];
    })
    .filter(function (d) {
      return (
        _ribbon_scales.chunk_whole_ref_scale(d.filtered_cum_pos + d.size) -
          _ribbon_scales.chunk_whole_ref_scale(d.filtered_cum_pos) >
        (_positions.fontsize / 5) * d.chrom.length
      );
    })
    .text(function (d) {
      var chrom = d.chrom;
      return chrom.replace("chr", "");
    })
    .attr("x", function (d) {
      return (
        _ribbon_scales.chunk_whole_ref_scale(d.filtered_cum_pos + d.size / 2) -
        _ribbon_scales.chunk_whole_ref_scale(d.filtered_cum_pos)
      );
    })
    .attr("y", -_ribbon_padding.text)
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "bottom")
    .style("font-size", _positions.fontsize);
}

function comma_format(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function bp_format(x) {
  if (x > 1000000) {
    return Math.round(x / 1000000).toString() + " Mb";
  }
  if (x > 1000) {
    return Math.round(x / 1000).toString() + " kb";
  }
}

function draw_chunk_ref_intervals() {
  if (_Chunk_ref_intervals.length == 0) {
    return;
  }

  _ribbon_scales.chunk_ref_interval_scale.range([
    _positions.multiread.ref_intervals.x,
    _positions.multiread.ref_intervals.x +
      _positions.multiread.ref_intervals.width,
  ]);

  // Zoom into reference intervals where the read maps:
  _ribbon_svg2
    .selectAll("rect.ref_interval")
    .data(_Chunk_ref_intervals)
    .enter()
    .append("rect")
    .attr("class", "ref_interval")
    .filter(function (d) {
      return d.cum_pos != -1;
    })
    .attr("x", function (d) {
      return _ribbon_scales.chunk_ref_interval_scale(d.cum_pos);
    })
    .attr("y", _positions.multiread.ref_intervals.y)
    .attr("width", function (d) {
      return (
        _ribbon_scales.chunk_ref_interval_scale(d.end) -
        _ribbon_scales.chunk_ref_interval_scale(d.start)
      );
    })
    .attr("height", _positions.multiread.ref_intervals.height)
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.chrom);
    })
    .attr("fill-opacity", _ribbon_static.dotplot_ref_opacity)
    .style("stroke-width", 1)
    .style("stroke", "black")
    .on("mouseover", function (d) {
      var text =
        d.chrom + ": " + comma_format(d.start) + " - " + comma_format(d.end);
      var x = _ribbon_scales.chunk_ref_interval_scale(
        d.cum_pos + (d.end - d.start) / 2
      );
      var y = _positions.multiread.ref_intervals.y - _ribbon_padding.text;
      show_ribbon_tooltip(text, x, y, _ribbon_svg2);
    })
    .on("mouseout", function (d) {
      _ribbon_svg2.selectAll("g.tip").remove();
    });

  // Ref interval mapping back to ref
  _ribbon_svg2
    .selectAll("path.ref_mapping")
    .data(_Chunk_ref_intervals)
    .enter()
    .append("path")
    .attr("class", "ref_mapping")
    .filter(function (d) {
      return d.cum_pos != -1;
    })
    .filter(function (d) {
      return map_whole_ref(d.chrom, d.start) != undefined;
    })
    .attr("d", function (d) {
      return ref_mapping_path_generator(d, true);
    })
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.chrom);
    });
}

function find_features_in_view(features, mapping_function, scale_function) {
  var features_in_view = [];

  for (var i in features) {
    var feature = features[i];
    if (feature.show != false) {
      var start_results = mapping_function(feature.chrom, feature.start);
      var end_results = mapping_function(feature.chrom, feature.end);
      if (start_results.pos != end_results.pos) {
        feature.start_cum_pos = scale_function(start_results.pos);
        feature.start_precision = start_results.precision;

        feature.end_cum_pos = scale_function(end_results.pos);
        feature.end_precision = end_results.precision;

        if (feature.end_cum_pos < feature.start_cum_pos + 4) {
          feature.start_cum_pos = feature.start_cum_pos - 2;
          feature.end_cum_pos = feature.start_cum_pos + 4;
        } else if (feature.end_cum_pos < feature.start_cum_pos) {
          var tmp = feature.start_cum_pos;
          feature.start_cum_pos = feature.end_cum_pos;
          feature.end_cum_pos = tmp;
        }

        features_in_view.push(feature);
      }
    }
  }
  return features_in_view;
}

function calculate_offsets_for_features_in_view(features_in_view) {
  var padding = 20;

  var sweep_list = [];
  for (var i in features_in_view) {
    sweep_list.push([features_in_view[i].start_cum_pos, i]);
  }

  sweep_list.sort(function (a, b) {
    return a[0] - b[0];
  });

  var channels = [];
  for (var i in sweep_list) {
    var found = false;
    for (var j in channels) {
      if (channels[j] < features_in_view[sweep_list[i][1]].start_cum_pos) {
        channels[j] = features_in_view[sweep_list[i][1]].end_cum_pos + padding;
        features_in_view[sweep_list[i][1]].offset = j;
        found = true;
        break;
      }
    }
    if (found == false) {
      features_in_view[sweep_list[i][1]].offset = channels.length;
      channels.push(features_in_view[sweep_list[i][1]].end_cum_pos + padding);
    }
  }

  return channels.length;
}

function draw_chunk_features() {
  if (_Chunk_alignments.length > 0) {
    if (_Features_for_ribbon.length > 0) {
      var features_in_view = find_features_in_view(
        _Features_for_ribbon,
        closest_map_chunk_ref_interval,
        _ribbon_scales.chunk_ref_interval_scale
      );
      var max_overlaps =
        calculate_offsets_for_features_in_view(features_in_view);
      if (_ribbon_settings.show_features_as == "rectangles") {
        _ribbon_svg2
          .selectAll("rect.features")
          .data(features_in_view)
          .enter()
          .append("rect")
          .attr("class", function (d) {
            if (d.highlight == true) {
              return "variants highlight";
            } else {
              return "variants";
            }
          })
          .attr("x", function (d) {
            return d.start_cum_pos;
          })
          .attr("width", function (d) {
            return d.end_cum_pos - d.start_cum_pos;
          })
          .attr("y", function (d) {
            return (
              _positions.multiread.features.y +
              (_positions.multiread.features.rect_height * d.offset) /
                max_overlaps
            );
          })
          .attr(
            "height",
            (_positions.multiread.features.rect_height * 0.9) / max_overlaps
          )
          .style("fill", function (d) {
            return _ribbon_scales.feature_color_scale(d.type);
          })
          .on("mouseover", function (d) {
            var text = d.name;
            if (d.type != undefined) {
              text = d.name + " (" + d.type + ")";
            }
            var x = (d.start_cum_pos + d.end_cum_pos) / 2;
            var y =
              _positions.multiread.features.y +
              (_positions.multiread.features.rect_height * d.offset) /
                max_overlaps -
              _ribbon_padding.text;
            show_ribbon_tooltip(text, x, y, _ribbon_svg2);
          })
          .on("mouseout", function (d) {
            _ribbon_svg2.selectAll("g.tip").remove();
          });
      } else if (
        _ribbon_settings.show_features_as == "arrows" ||
        _ribbon_settings.show_features_as == "names"
      ) {
        var feature_path_generator = function (d) {
          var arrow = -1 * _positions.multiread.features.arrow_size,
            x1 = d.start_cum_pos,
            x2 = d.end_cum_pos,
            y =
              _positions.multiread.features.y +
              (_positions.multiread.features.rect_height * d.offset) /
                max_overlaps,
            direction = Number(d.strand == "+") * 2 - 1;
          var xmid = (x1 + x2) / 2;

          return (
            "M " +
            x1 +
            " " +
            y +
            " L " +
            xmid +
            " " +
            y +
            " L " +
            (xmid + arrow * direction) +
            " " +
            (y + arrow) +
            " L " +
            xmid +
            " " +
            y +
            " L " +
            (xmid + arrow * direction) +
            " " +
            (y - arrow) +
            " L " +
            xmid +
            " " +
            y +
            " L " +
            x2 +
            " " +
            y
          );
        };

        _ribbon_svg2
          .selectAll("path.features")
          .data(features_in_view)
          .enter()
          .append("path")
          .attr("class", function (d) {
            if (d.highlight == true) {
              return "features highlight";
            } else {
              return "features";
            }
          })
          .attr("d", feature_path_generator)
          .style("stroke", function (d) {
            return _ribbon_scales.feature_color_scale(d.type);
          })
          .on("mouseover", function (d) {
            var text = d.name;
            if (d.type != undefined) {
              text = d.name + " (" + d.type + ")";
            }
            var x = (d.start_cum_pos + d.end_cum_pos) / 2;
            var y =
              _positions.multiread.features.y +
              (_positions.multiread.features.rect_height * d.offset) /
                max_overlaps -
              _ribbon_padding.text;
            show_ribbon_tooltip(text, x, y, _ribbon_svg2);
          })
          .on("mouseout", function (d) {
            _ribbon_svg2.selectAll("g.tip").remove();
          });

        if (_ribbon_settings.show_features_as == "names") {
          var text_boxes = _ribbon_svg2
            .selectAll("g.features")
            .data(features_in_view)
            .enter()
            .append("g")
            .attr("class", "features")
            .attr("transform", function (d) {
              return (
                "translate(" +
                (d.start_cum_pos + d.end_cum_pos) / 2 +
                "," +
                (_positions.multiread.features.y +
                  (_positions.multiread.features.rect_height * d.offset) /
                    max_overlaps -
                  _ribbon_padding.text) +
                ")"
              );
            });

          var height =
            (_positions.multiread.features.rect_height / (max_overlaps + 3)) *
            2;

          text_boxes
            .append("text")
            .attr("class", function (d) {
              if (d.highlight == true) {
                return "features highlight";
              } else {
                return "features";
              }
            })
            .attr("x", 0)
            .attr("y", 0)
            .attr("fill", function (d) {
              return _ribbon_scales.feature_color_scale(d.type);
            })
            .style("font-size", height)
            .style("text-anchor", "middle")
            .attr("dominant-baseline", "ideographic")
            .text(function (d) {
              return d.name;
            });
        }
      }
    }
  }
}
function draw_chunk_variants() {
  // Show bed file contents:

  if (_Chunk_alignments.length > 0) {
    if (_Variants.length > 0) {
      var variants_in_view = find_features_in_view(
        _Variants,
        closest_map_chunk_ref_interval,
        _ribbon_scales.chunk_ref_interval_scale
      );
      var variants_to_show = [];
      for (var i in variants_in_view) {
        if (
          _ribbon_settings.show_only_selected_variants == false ||
          variants_in_view[i].highlight == true
        ) {
          variants_to_show.push(variants_in_view[i]);
        }
      }

      var max_overlaps =
        calculate_offsets_for_features_in_view(variants_to_show);
      _ribbon_svg2
        .selectAll("rect.variants")
        .data(variants_to_show)
        .enter()
        .append("rect")
        .attr("class", function (d) {
          if (d.highlight == true) {
            return "variants highlight";
          } else {
            return "variants";
          }
        })
        .attr("x", function (d) {
          return d.start_cum_pos;
        })
        .attr("width", function (d) {
          return d.end_cum_pos - d.start_cum_pos;
        })
        .attr("y", function (d) {
          return (
            _positions.multiread.variants.y +
            (_positions.multiread.variants.rect_height * d.offset) /
              max_overlaps
          );
        })
        .attr(
          "height",
          (_positions.multiread.variants.rect_height * 0.9) / max_overlaps
        )
        .style("fill", function (d) {
          return _ribbon_scales.variant_color_scale(d.type);
        })
        .on("mouseover", function (d) {
          var text = d.name;
          if (d.type != undefined) {
            text = d.name + " (" + d.type + ")";
          }
          var x = (d.start_cum_pos + d.end_cum_pos) / 2;
          var y =
            _positions.multiread.variants.y +
            (_positions.multiread.variants.rect_height * d.offset) /
              max_overlaps -
            _ribbon_padding.text;
          show_ribbon_tooltip(text, x, y, _ribbon_svg2);
        })
        .on("mouseout", function (d) {
          _ribbon_svg2.selectAll("g.tip").remove();
        });
    }

    if (_Bedpe.length > 0) {
      var variants_in_view = [];
      for (var i in _Bedpe) {
        if (
          _ribbon_settings.show_only_selected_variants == false ||
          _Bedpe[i].highlight == true
        ) {
          if (
            map_chunk_ref_interval(_Bedpe[i].chrom1, _Bedpe[i].pos1) !=
              undefined &&
            map_chunk_ref_interval(_Bedpe[i].chrom2, _Bedpe[i].pos2) !=
              undefined
          ) {
            var variant = _Bedpe[i];
            var results1 = closest_map_chunk_ref_interval(
              variant.chrom1,
              variant.pos1
            );
            variant.cum_pos1 = _ribbon_scales.chunk_ref_interval_scale(
              results1.pos
            );

            var results2 = closest_map_chunk_ref_interval(
              variant.chrom2,
              variant.pos2
            );
            variant.cum_pos2 = _ribbon_scales.chunk_ref_interval_scale(
              results2.pos
            );
            variants_in_view.push(variant);
            if (
              _Bedpe[i].highlight == true &&
              _ribbon_settings.add_coordinates_to_figures == true
            ) {
              _ribbon_svg2
                .append("text")
                .text(
                  _Bedpe[i].chrom1 +
                    ":" +
                    _Bedpe[i].pos1 +
                    ":" +
                    _Bedpe[i].strand1 +
                    " to " +
                    _Bedpe[i].chrom2 +
                    ":" +
                    _Bedpe[i].pos2 +
                    ":" +
                    _Bedpe[i].strand2
                )
                .attr("x", _layout.svg2_width / 2)
                .attr("y", _layout.svg2_height)
                .style("text-anchor", "middle")
                .attr("dominant-baseline", "ideographic")
                .style("font-size", _positions.fontsize);
              //_svg.append("text").text("Reference").attr("x",_positions.dotplot.canvas.x + _positions.dotplot.canvas.width/2).attr("y",_layout.svg_height).style('text-anchor',"middle").attr("dominant-baseline","ideographic").style("font-size",_positions.fontsize);
            }
          }
        }
      }

      var loop_path_generator = function (d) {
        var foot_length = _positions.multiread.variants.foot_length;

        var x1 = d.cum_pos1,
          y_top = _positions.multiread.ref_intervals.y,
          x2 = d.cum_pos2,
          y_foot = _positions.multiread.variants.y,
          y_ankle =
            _positions.multiread.variants.y +
            _positions.multiread.variants.ankle_height;

        var arrow = -1 * _positions.multiread.variants.arrow_size;

        var xmid = (x1 + x2) / 2;
        var ymid =
          _positions.multiread.variants.y +
          _positions.multiread.variants.ankle_height +
          _positions.multiread.variants.bezier_height; //y1 + _scales.connection_loops["top"](Math.abs(d.pos1-d.pos2))

        var direction1 = Number(d.strand1 == "-") * 2 - 1, // negative strands means the read is mappping to the right of the breakpoint
          direction2 = Number(d.strand2 == "-") * 2 - 1;

        return (
          "M " +
          (x1 + foot_length * direction1) +
          " " +
          y_foot + // toe
          " L " +
          (x1 + foot_length * direction1 + arrow * direction1) +
          " " +
          (y_foot + arrow) + // arrow
          " L " +
          (x1 + foot_length * direction1) +
          " " +
          y_foot + // toe
          " L " +
          (x1 + foot_length * direction1 + arrow * direction1) +
          " " +
          (y_foot - arrow) + // arrow
          " L " +
          (x1 + foot_length * direction1) +
          " " +
          y_foot + // toe
          " L " +
          x1 +
          " " +
          y_foot + // breakpoint
          // + " L " + x1                          + " " + y_top // up
          " L " +
          x1 +
          " " +
          y_ankle + // ankle
          " S " +
          xmid +
          " " +
          ymid +
          " " +
          x2 +
          " " +
          y_ankle + // curve to breakpoint
          // + " L " + x2                          + " " + y_top // up
          " L " +
          x2 +
          " " +
          y_foot + // breakpoint
          " L " +
          (x2 + foot_length * direction2) +
          " " +
          y_foot + // toe
          " L " +
          (x2 + foot_length * direction2 + arrow * direction2) +
          " " +
          (y_foot + arrow) + // arrow
          " L " +
          (x2 + foot_length * direction2) +
          " " +
          y_foot + // toe
          " L " +
          (x2 + foot_length * direction2 + arrow * direction2) +
          " " +
          (y_foot - arrow) + // arrow
          " L " +
          (x2 + foot_length * direction2) +
          " " +
          y_foot
        ); // toe
      };

      _ribbon_svg2
        .selectAll("path.bedpe_variants")
        .data(variants_in_view)
        .enter()
        .append("path")
        .attr("class", function (d) {
          if (d.highlight == true) {
            return "bedpe_variants highlight";
          } else {
            return "bedpe_variants";
          }
        })
        .attr("d", loop_path_generator)
        .style("stroke", "black") // function(d){return _scales.variant_color_scale(d.type)})
        .on("mouseover", function (d) {
          var text = d.name;
          if (d.type != undefined) {
            text = d.name + " (" + d.type + ")";
          }
          var x = (d.cum_pos1 + d.cum_pos2) / 2;
          var y = _positions.multiread.variants.y - _ribbon_padding.text;
          show_ribbon_tooltip(text, x, y, _ribbon_svg2);
        })
        .on("mouseout", function (d) {
          _ribbon_svg2.selectAll("g.tip").remove();
        });
    }
  }
}

function draw_chunk_alignments() {
  if (_Chunk_alignments.length == 0) {
    return;
  }

  if (_Additional_ref_intervals.length > 0) {
    for (var i in _Additional_ref_intervals) {
      var d = _Additional_ref_intervals[i];
      _Additional_ref_intervals[i].x_pos =
        _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.chrom, d.start)
        );
      _Additional_ref_intervals[i].width =
        _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.chrom, d.end)
        ) -
        _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.chrom, d.start)
        );
    }
    if (_ribbon_settings.draw_focus_rectangle == true) {
      _ribbon_svg2
        .selectAll("rect.focal_regions")
        .data(_Additional_ref_intervals)
        .enter()
        .append("rect")
        .attr("class", "focal_regions")
        .filter(function (d) {
          return isNaN(d.x_pos) === false && isNaN(d.width) === false;
        })
        .attr("x", function (d) {
          return d.x_pos;
        })
        .attr("y", _positions.multiread.ref_intervals.y)
        .attr("width", function (d) {
          return d.width;
        })
        .attr("height", _positions.multiread.ref_intervals.height)
        .attr("fill", "none")
        .style("stroke-width", 4)
        .style("stroke", "black");
    }
  }

  var chunks = [];
  var counter = 0;
  for (var i in _Chunk_alignments) {
    if (
      _Chunk_alignments[i].alignments[0].read_length >=
        _ribbon_settings.min_read_length &&
      _Chunk_alignments[i].alignments.length <=
        _ribbon_settings.max_num_alignments &&
      _Chunk_alignments[i].alignments.length >=
        _ribbon_settings.min_num_alignments &&
      _Chunk_alignments[i].max_mq >= _ribbon_settings.region_min_mapping_quality
    ) {
      var has_visible_alignments = false;
      for (var j in _Chunk_alignments[i].alignments) {
        if (_Refs_show_or_hide[_Chunk_alignments[i].alignments[j].r] == true) {
          has_visible_alignments = true;
          break;
        }
      }
      if (has_visible_alignments) {
        // Copy over all the read's features
        var this_chunk = {};
        for (var key in _Chunk_alignments[i]) {
          this_chunk[key] = _Chunk_alignments[i][key];
        }

        // Filter alignments for each chunk:
        var filtered_alignments = [];
        for (var a in _Chunk_alignments[i].alignments) {
          var d = _Chunk_alignments[i].alignments[a];
          if (
            _Refs_show_or_hide[d.r] &&
            map_chunk_ref_interval(d.r, d.rs) != undefined
          ) {
            filtered_alignments.push(d);
          }
        }
        this_chunk.unfiltered_alignments = this_chunk.alignments;
        this_chunk.alignments = filtered_alignments;
        chunks.push(this_chunk);
        chunks[counter].index = i; // to remember the data order even after sorting
        counter++;
      }
    }
  }

  //////////////  SORT READS  //////////////
  if (_ribbon_settings.feature_to_sort_reads == "num_alignments") {
    chunks.sort(function (a, b) {
      return a.alignments.length - b.alignments.length;
    });
  } else if (_ribbon_settings.feature_to_sort_reads == "readname") {
    chunks.sort(function (a, b) {
      return natural_sort(a.readname, b.readname);
    });
  } else if (_ribbon_settings.feature_to_sort_reads == "original") {
    chunks.sort(function (a, b) {
      return a.index - b.index;
    });
  } else if (_ribbon_settings.feature_to_sort_reads == "longest") {
    for (var i in chunks) {
      if (chunks[i].longest_ref_pos == undefined) {
        var longest = chunks[i].alignments[chunks[i].index_longest];
        if (longest == undefined) {
          longest = chunks[i].alignments[0];
        }
        chunks[i].longest_ref_pos = _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(longest.r, longest.rs)
        );
      }
    }
    chunks.sort(function (a, b) {
      return a.longest_ref_pos - b.longest_ref_pos;
    });
  } else if (_ribbon_settings.feature_to_sort_reads == "primary") {
    for (var i in chunks) {
      if (chunks[i].primary_ref_pos == undefined) {
        var primary = chunks[i].alignments[chunks[i].index_primary];
        if (primary == undefined) {
          primary = chunks[i].alignments[0];
        }
        chunks[i].primary_ref_pos = _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(primary.r, primary.rs)
        );
      }
    }
    chunks.sort(function (a, b) {
      return a.primary_ref_pos - b.primary_ref_pos;
    });
  } else if (_ribbon_settings.feature_to_sort_reads == "HP") {
    // HP can be "1", "2", undefined, and possibly other strings. Just make sure they are grouped.
    chunks.sort(function (a, b) {
      if (a.raw.HP === b.raw.HP) {
        return a.index - b.index;
      }
      if (a.raw.HP === undefined) {
        return 1;
      }
      if (b.raw.HP === undefined) {
        return -1;
      }
      return a.raw.HP.localeCompare(b.raw.HP);
    });
  } else if (_ribbon_settings.feature_to_sort_reads == "bam") {
    chunks.sort(function (a, b) {
      if (a.raw.bam === b.raw.bam) {
        return a.index - b.index;
      }
      return a.raw.bam - b.raw.bam;
    });
  } else {
    console.error(
      "Unknown feature to sort reads in _ribbon_settings.feature_to_sort_reads"
    );
  }

  //////////////  Re-orient reads  //////////////
  var num_reads_to_show = chunks.length;

  for (var i = 0; i < chunks.length; i++) {
    // Read flipping computations only necessary if it affects color or
    // for paired-end mode where it affects filtering.
    const need_to_compute_flips =
      (_ribbon_settings.color_alignments_by === "orientation" ||
      _ribbon_settings.paired_end_mode);

    if (need_to_compute_flips) {
      // Whether to flip orientation across all alignments of the read
      if (_ribbon_settings.orient_reads_by == "primary") {
        const primary_alignment = chunks[i].unfiltered_alignments[chunks[i].index_primary];
        chunks[i].flip = primary_alignment.qe < primary_alignment.qs;
      } else if (_ribbon_settings.orient_reads_by == "longest") {
        const longest_alignment = chunks[i].unfiltered_alignments[chunks[i].index_longest];
        chunks[i].flip = longest_alignment.qe < longest_alignment.qs;
      } else if (_ribbon_settings.orient_reads_by == "original") {
        chunks[i].flip = false;
      } else {
        console.error(
          "Unknown orientation mode in _ribbon_settings.orient_reads_by"
        );
      }
    }

    ////////////  Color alignments  //////////////
    if (_ribbon_settings.color_alignments_by === "strand") {
      // Original strand from the data.
      for (let alignment of chunks[i].alignments) {
        let forward = alignment.qs < alignment.qe;
        alignment.color = forward ? "blue" : "red";
      }
    } else if (_ribbon_settings.color_alignments_by === "orientation") {
      for (let alignment of chunks[i].alignments) {
        let forward = alignment.qs < alignment.qe; // query start before query end means alignment is forward.
        if (chunks[i].flip) {
          alignment.color = forward ? "red" : "blue";
        } else {
          alignment.color = forward ? "blue" : "red";
        }
      }
    } else if (_ribbon_settings.color_alignments_by === "HP") {
      // Color by HP tag
      let HP_color = _ribbon_scales.HP_color_scale(chunks[i].raw.HP);
      for (let alignment of chunks[i].alignments) {
        alignment.color = HP_color;
      }
    } else if (_ribbon_settings.color_alignments_by === "bam") {
      // Color by BAM file
      let BAM_color = _ribbon_scales.which_BAM_scale(chunks[i].raw.bam);
      for (let alignment of chunks[i].alignments) {
        alignment.color = BAM_color;
      }
    } else {
      console.error(
        "Unknown color mode in _ribbon_settings.color_alignments_by"
      );
    }

    // Vertical position:
    chunks[i].read_y =
      _positions.multiread.reads.top_y +
      (_positions.multiread.reads.height * (i + 0.5)) / num_reads_to_show;
  }

  //////////////  Draw rows  //////////////
  var alignment_groups = _ribbon_svg2
    .selectAll("g.alignment_groups")
    .data(chunks)
    .enter()
    .append("g")
    .attr("class", "alignment_groups")
    .attr("transform", function (d) {
      return "translate(" + 0 + "," + d.read_y + ")";
    })
    .on("click", function (d) {
      new_read_selected(d.index);
    });

  if (_ribbon_settings.paired_end_mode) {
    alignment_groups
      .append("line")
      .filter(function (d) {
        return (
          d.pair_link.to[d.flip] != undefined &&
          d.pair_link.from[d.flip] != undefined
        );
      })
      .attr("class", "pair_link")
      .attr("x1", function (d) {
        return _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(
            d.pair_link.chrom[d.flip],
            d.pair_link.from[d.flip]
          )
        );
      })
      .attr("x2", function (d) {
        return _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(
            d.pair_link.chrom[d.flip],
            d.pair_link.to[d.flip]
          )
        );
      })
      .style("stroke", "black");
  }

  ////////////  Draw alignments  //////////////
  if (_ribbon_settings.show_indels_as == "none") {
    // Draw simple lines
    alignment_groups
      .selectAll("line.alignment")
      .data(function (read_record) {
        return read_record.alignments;
      })
      .enter()
      .append("line")
      .attr("class", "alignment")
      .attr("x1", function (d) {
        return _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.r, d.rs)
        );
      })
      .attr("x2", function (d) {
        return _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.r, d.re)
        );
      })
      .attr("y1", 0)
      .attr("y2", 0)
      .style("stroke", d => d.color)
      .on("mouseover", function (d) {
        var text = "select read";
        var x = _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.r, (d.rs + d.re) / 2)
        );
        var y =
          d3.select(this.parentNode).datum().read_y - _ribbon_tooltip.height;
        show_ribbon_tooltip(text, x, y, _ribbon_svg2);
      })
      .on("mouseout", function (d) {
        _ribbon_svg2.selectAll("g.tip").remove();
      });
  } else {
    function chunk_alignment_path_generator(d) {
      var previous_x = _ribbon_scales.chunk_ref_interval_scale(
        map_chunk_ref_interval(d.r, d.path[0].R)
      );
      var previous_read_position = d.path[0].Q;

      var output = "M " + previous_x + " " + 0;

      for (var i = 1; i < d.path.length; i++) {
        var current_x = _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.r, d.path[i].R)
        );
        var current_read_position = d.path[i].Q;
        if (current_read_position == previous_read_position) {
          // current_x == previous_x ||
          output += " M " + current_x + " " + 0;
        } else {
          output += " L " + current_x + " " + 0;
        }
        previous_x = current_x;
        previous_read_position = current_read_position;
      }
      return output;
    }

    // Draw paths to allow indels
    alignment_groups
      .selectAll("path.alignment")
      .data(function (read_record) {
        return read_record.alignments;
      })
      .enter()
      .append("path")
      .attr("class", "alignment")
      .attr("d", chunk_alignment_path_generator)
      .style("stroke", d => d.color)
      .on("mouseover", function (d) {
        var text = "select read";
        var x = _ribbon_scales.chunk_ref_interval_scale(
          map_chunk_ref_interval(d.r, (d.rs + d.re) / 2)
        );
        var y =
          d3.select(this.parentNode).datum().read_y - _ribbon_tooltip.height;
        show_ribbon_tooltip(text, x, y, _ribbon_svg2);
      })
      .on("mouseout", function (d) {
        _ribbon_svg2.selectAll("g.tip").remove();
      });

    // Record all of the insertions and deletions from these alignments
    if (
      _ribbon_settings.show_indels_as != "none" &&
      _ribbon_settings.show_indels_as != "gaps"
    ) {
      for (var i in chunks) {
        for (var j in chunks[i].alignments) {
          chunks[i].alignments[j].deletions = [];
          chunks[i].alignments[j].insertions = [];

          var path = chunks[i].alignments[j].path;
          var previous_ref_pos = path[0].R;
          var previous_read_pos = path[0].Q;
          for (var p = 1; p < path.length; p++) {
            var current_ref_pos = path[p].R;
            var current_read_pos = path[p].Q;
            if (
              current_read_pos == previous_read_pos &&
              current_ref_pos != previous_ref_pos
            ) {
              chunks[i].alignments[j].deletions.push({
                R1: previous_ref_pos,
                R2: current_ref_pos,
                size: Math.abs(current_ref_pos - previous_ref_pos),
                chrom: chunks[i].alignments[j].r,
              });
            }
            if (
              current_ref_pos == previous_ref_pos &&
              current_read_pos != previous_read_pos
            ) {
              chunks[i].alignments[j].insertions.push({
                R: current_ref_pos,
                size: Math.abs(current_read_pos - previous_read_pos),
                chrom: chunks[i].alignments[j].r,
              });
            }
            previous_ref_pos = current_ref_pos;
            previous_read_pos = current_read_pos;
          }
        }
      }

      if (
        _ribbon_settings.show_indels_as == "thin" ||
        _ribbon_settings.show_indels_as == "numbers"
      ) {
        var deletion_groups = alignment_groups
          .selectAll("g.alignment_deletions")
          .data(function (read_record) {
            return read_record.alignments;
          })
          .enter()
          .append("g")
          .attr("class", "alignment_deletions")
          .selectAll("g.deletions")
          .data(function (alignment) {
            return alignment.deletions;
          })
          .enter()
          .append("g")
          .attr("class", "deletions")
          .on("mouseover", function (d) {
            var text = d.size + "bp deletion";
            var x = _ribbon_scales.chunk_ref_interval_scale(
              map_chunk_ref_interval(d.chrom, (d.R1 + d.R2) / 2)
            );
            var y =
              d3.select(this.parentNode.parentNode).datum().read_y -
              _ribbon_tooltip.height;
            show_ribbon_tooltip(text, x, y, _ribbon_svg2);
          })
          .on("mouseout", function (d) {
            _ribbon_svg2.selectAll("g.tip").remove();
          });

        deletion_groups
          .append("line")
          .attr("x1", function (d) {
            return _ribbon_scales.chunk_ref_interval_scale(
              map_chunk_ref_interval(d.chrom, d.R1)
            );
          })
          .attr("x2", function (d) {
            return _ribbon_scales.chunk_ref_interval_scale(
              map_chunk_ref_interval(d.chrom, d.R2)
            );
          })
          .attr("y1", 0)
          .attr("y2", 0)
          .style("stroke", (d) => d.color)
          .style("stroke-width", 1)
          .style("stroke-opacity", 0.5);

        var insertion_groups = alignment_groups
          .selectAll("g.alignment_insertions")
          .data(function (read_record) {
            return read_record.alignments;
          })
          .enter()
          .append("g")
          .attr("class", "alignment_insertions")
          .selectAll("g.insertions")
          .data(function (alignment) {
            return alignment.insertions;
          })
          .enter()
          .append("g")
          .attr("class", "insertions")
          .on("mouseover", function (d) {
            var text = d.size + "bp insertion";
            var x = _ribbon_scales.chunk_ref_interval_scale(
              map_chunk_ref_interval(d.chrom, d.R)
            );
            var y =
              d3.select(this.parentNode.parentNode).datum().read_y -
              _ribbon_tooltip.height;
            show_ribbon_tooltip(text, x, y, _ribbon_svg2);
          })
          .on("mouseout", function (d) {
            _ribbon_svg2.selectAll("g.tip").remove();
          });

        insertion_groups
          .append("circle")
          .attr("cx", function (d) {
            return _ribbon_scales.chunk_ref_interval_scale(
              map_chunk_ref_interval(d.chrom, d.R)
            );
          })
          .attr("cy", 0)
          .attr("r", function (d) {
            return (
              Math.min(
                _layout.svg_height / 40,
                _positions.multiread.reads.height / num_reads_to_show
              ) * 0.5
            );
          })
          .style("fill", d => d.color)
          .style("stroke", "black")
          .style("stroke-width", 1);

        if (_ribbon_settings.show_indels_as == "numbers") {
          var height =
            (_positions.multiread.reads.height / num_reads_to_show) * 0.9; //_layout.svg_height/40;
          var width = height * 4;

          deletion_groups
            .append("rect")
            .attr("width", width)
            .attr("x", function (d) {
              return (
                _ribbon_scales.chunk_ref_interval_scale(
                  map_chunk_ref_interval(d.chrom, (d.R1 + d.R2) / 2)
                ) -
                width / 2
              );
            })
            .attr("height", height)
            .attr("y", -height / 2)
            .attr("fill", "white");
          deletion_groups
            .append("text")
            .text(function (d) {
              return d.size;
            })
            .attr("x", function (d) {
              return _ribbon_scales.chunk_ref_interval_scale(
                map_chunk_ref_interval(d.chrom, (d.R1 + d.R2) / 2)
              );
            })
            .attr("y", 0)
            .style("font-size", height)
            .style("text-anchor", "middle")
            .attr("dominant-baseline", "middle");

          insertion_groups
            .append("rect")
            .attr("width", width)
            .attr("x", function (d) {
              return (
                _ribbon_scales.chunk_ref_interval_scale(
                  map_chunk_ref_interval(d.chrom, d.R)
                ) -
                width / 2
              );
            })
            .attr("height", height)
            .attr("y", -height / 2)
            .attr("fill", "black");
          insertion_groups
            .append("text")
            .text(function (d) {
              return d.size;
            })
            .attr("x", function (d) {
              return _ribbon_scales.chunk_ref_interval_scale(
                map_chunk_ref_interval(d.chrom, d.R)
              );
            })
            .attr("y", 0)
            .style("fill", "white")
            .style("font-size", height)
            .style("text-anchor", "middle")
            .attr("dominant-baseline", "middle");
        }
      }
    }
  }
}

function draw_region_view() {
  reset_svg2();
  draw_chunk_ref();
  adjust_multiread_layout();
  if (_Chunk_alignments.length > 0) {
    draw_chunk_ref_intervals();
    draw_chunk_alignments();
    draw_chunk_variants();
    draw_chunk_features();
  }
}

function clear_data() {
  _Alignments = [];
  _Chunk_alignments = [];
  _Whole_refs = [];
  _Ref_intervals = [];
  _Chunk_ref_intervals = [];
  _Ref_sizes_from_header = {};
}

function highlight_chromosome(chromosome) {
  if (_ribbon_settings.single_chrom_highlighted == true) {
    show_all_chromosomes();
    apply_ref_filters();
    draw_region_view();
    if (_ribbon_settings.ref_match_chunk_ref_intervals == true) {
      apply_ref_filters();
      select_read();
    }
    _ribbon_settings.single_chrom_highlighted = false;
  } else {
    for (var chrom in _Refs_show_or_hide) {
      _Refs_show_or_hide[chrom] = false;
    }
    _Refs_show_or_hide[chromosome] = true;

    apply_ref_filters();
    draw_region_view();

    if (_ribbon_settings.ref_match_chunk_ref_intervals == true) {
      select_read();
    }

    d3.select("#chrom_highlighted").html(chromosome);
    d3.select("#show_all_refs").style("display", "inline");
    _ribbon_settings.single_chrom_highlighted = true;
  }
}

function show_all_chromosomes() {
  for (var i in _Chunk_ref_intervals) {
    _Refs_show_or_hide[_Chunk_ref_intervals[i].chrom] = true;
  }
  for (var i in _Whole_refs) {
    _Refs_show_or_hide[_Whole_refs[i].chrom] = true;
  }
  d3.select("#chrom_highlighted").html("all");
  d3.select("#show_all_refs").style("display", "none");
}

function apply_feature_filters() {
  for (var f in _Features_for_ribbon) {
    if (
      _ribbon_settings.feature_types_to_show[_Features_for_ribbon[f].type] ===
      true
    ) {
      _Features_for_ribbon[f].show = true;
    } else {
      _Features_for_ribbon[f].show = false;
    }
  }
}

function apply_ref_filters() {
  var interval_cumulative_position = 0;
  for (var i in _Chunk_ref_intervals) {
    if (_Refs_show_or_hide[_Chunk_ref_intervals[i].chrom] == true) {
      if (
        _Chunk_ref_intervals[i].num_alignments >=
        _ribbon_settings.min_aligns_for_ref_interval
      ) {
        _Chunk_ref_intervals[i].cum_pos = interval_cumulative_position;
        interval_cumulative_position += _Chunk_ref_intervals[i].size;
      } else {
        _Chunk_ref_intervals[i].cum_pos = -1;
      }
    } else {
      _Chunk_ref_intervals[i].cum_pos = -1;
    }
  }
  var whole_cumulative_position = 0;
  for (var i in _Whole_refs) {
    if (_Refs_show_or_hide[_Whole_refs[i].chrom] == true) {
      _Whole_refs[i].filtered_cum_pos = whole_cumulative_position;
      whole_cumulative_position += _Whole_refs[i].size;
    }
  }

  _ribbon_scales.chunk_ref_interval_scale.domain([
    0,
    interval_cumulative_position,
  ]);
  _ribbon_scales.chunk_whole_ref_scale.domain([0, whole_cumulative_position]);

  var chromosomes = d3.keys(_Refs_show_or_hide);
  chromosomes.sort(function (a, b) {
    return a.length - b.length;
  });

  var chrom_livesearch = Livesearch()
    .max_suggestions_to_show(5)
    .search_list(chromosomes)
    .selection_function(search_select_chrom)
    .placeholder(chromosomes[0]);
  d3.select("#chrom_livesearch").call(chrom_livesearch);
}

function chunk_changed() {
  // Show results only if there is anything to show
  if (_Chunk_alignments.length > 0) {
    all_read_analysis(); // calculates features of each alignment and adds these variables to _Chunk_alignments

    organize_references_for_chunk();

    show_all_chromosomes();
    apply_ref_filters();

    d3.select("#variant_input_panel").style("display", "block");
    d3.select("#feature_input_panel").style("display", "block");

    draw_region_view();

    new_read_selected(0);

    var readname_livesearch = Livesearch()
      .max_suggestions_to_show(5)
      .search_list(_Chunk_alignments)
      .search_key("readname")
      .selection_function(search_select_read)
      .placeholder(_Chunk_alignments[0].readname);
    d3.select("#readname_livesearch").call(readname_livesearch);
  } else {
    _Alignments = [];
    _Chunk_ref_intervals = [];
    draw_region_view();
  }

  refresh_visibility();
}

function parse_paired_end(record) {
  var first_read_length = _ribbon_settings.default_read_length;
  var second_read_length = _ribbon_settings.default_read_length;
  var readname = "";
  var new_alignments = [];
  var pair_link_positions = {
    from: { true: undefined, false: undefined },
    to: { true: undefined, false: undefined },
    chrom: { true: undefined, false: undefined },
  };
  if (record.first != undefined) {
    first_read_length = record.first.alignments[0].read_length;
    readname = record.first.readname;

    for (var i in record.first.alignments) {
      var alignment = {};
      for (var j in record.first.alignments[i]) {
        alignment[j] = record.first.alignments[i][j];
      }
      if (
        pair_link_positions.from["false"] == undefined ||
        record.first.alignments[i].re > pair_link_positions.from["false"]
      ) {
        pair_link_positions.from["false"] = record.first.alignments[i].re;
        pair_link_positions.chrom["false"] = record.first.alignments[i].r;
      }
      if (record.first.alignments[i].rs > pair_link_positions.from["false"]) {
        pair_link_positions.from["false"] = record.first.alignments[i].rs;
        pair_link_positions.chrom["false"] = record.first.alignments[i].r;
      }
      if (
        pair_link_positions.to["true"] == undefined ||
        record.first.alignments[i].re < pair_link_positions.to["true"]
      ) {
        pair_link_positions.to["true"] = record.first.alignments[i].re;
        pair_link_positions.chrom["true"] = record.first.alignments[i].r;
      }
      if (record.first.alignments[i].rs < pair_link_positions.to["true"]) {
        pair_link_positions.to["true"] = record.first.alignments[i].rs;
        pair_link_positions.chrom["true"] = record.first.alignments[i].r;
      }
      new_alignments.push(alignment);
    }
  }
  var second_read_shift =
    first_read_length + _ribbon_settings.read_pair_spacing;
  var total_read_length =
    first_read_length + _ribbon_settings.read_pair_spacing + second_read_length;
  if (record.second != undefined) {
    readname = record.second.readname;
    second_read_length = record.second.alignments[0].read_length;
    total_read_length =
      first_read_length +
      _ribbon_settings.read_pair_spacing +
      second_read_length;

    for (var i in record.second.alignments) {
      var new_alignment = {};
      for (let key in record.second.alignments[i]) {
        new_alignment[key] = record.second.alignments[i][key];
      }
      if (_ribbon_settings.flip_second_read_in_pair) {
        new_alignment.qs = record.second.alignments[i].qe + second_read_shift;
        new_alignment.qe = record.second.alignments[i].qs + second_read_shift;
      } else {
        new_alignment.qs = record.second.alignments[i].qs + second_read_shift;
        new_alignment.qe = record.second.alignments[i].qe + second_read_shift;
      }
      var new_path = [];
      for (var j = 0; j < new_alignment.path.length; j++) {
        if (_ribbon_settings.flip_second_read_in_pair) {
          new_path.push({
            R: new_alignment.path[j].R,
            Q: total_read_length - new_alignment.path[j].Q,
          });
        } else {
          new_path.push({
            R: new_alignment.path[j].R,
            Q: new_alignment.path[j].Q + second_read_shift,
          });
        }
      }
      new_alignment.path = new_path;
      new_alignments.push(new_alignment);

      if (pair_link_positions.chrom["false"] == new_alignment.r) {
        if (
          pair_link_positions.to["false"] == undefined ||
          new_alignment.rs < pair_link_positions.to["false"]
        ) {
          pair_link_positions.to["false"] = new_alignment.rs;
        }
        if (new_alignment.re < pair_link_positions.to["false"]) {
          pair_link_positions.to["false"] = new_alignment.re;
        }
      }
      if (pair_link_positions.chrom["true"] == new_alignment.r) {
        if (
          pair_link_positions.from["true"] == undefined ||
          new_alignment.rs > pair_link_positions.from["true"]
        ) {
          pair_link_positions.from["true"] = new_alignment.rs;
        }
        if (new_alignment.re > pair_link_positions.to["true"]) {
          pair_link_positions.from["true"] = new_alignment.re;
        }
      }
    }
  }

  for (var i in new_alignments) {
    new_alignments[i].read_length = total_read_length;
  }

  pair_link_positions.diff = parseInt(
    Math.abs(
      pair_link_positions.to["false"] - pair_link_positions.from["false"]
    )
  );
  return {
    raw_type: "paired-end",
    readname: readname,
    raw: record,
    alignments: new_alignments,
    read_lengths: [
      first_read_length,
      _ribbon_settings.read_pair_spacing,
      second_read_length,
    ],
    pair_link: pair_link_positions,
  };
}

function pair_up_any_paired_reads(records) {
  // Removing duplicates and pairing up records from paired-end reads
  _ribbon_settings.paired_end_mode = false;
  for (var i = 0; i < records.length; i++) {
    if ((records[i].flag & 1) == 1) {
      // read is paired
      _ribbon_settings.paired_end_mode = true;
    }
    if (i > 100) {
      break;
    }
  }

  if (_ribbon_settings.paired_end_mode) {
    if (!_ribbon_warnings.pe_mode) {
      user_message_ribbon(
        "Info",
        "Paired-end mode activated. Note that only read pairs within the region are shown because we use the SA tag to grab other alignments for the same read, but this does not help us get the other read in each pair"
      );
      _ribbon_warnings.pe_mode = true;
    }
    var paired_end_reads = {};
    var read_length_counts = {};
    for (var i in records) {
      if (paired_end_reads[records[i].readname] == undefined) {
        paired_end_reads[records[i].readname] = {};
      }
      var read_length = records[i].alignments[0].read_length;
      if (read_length_counts[read_length] == undefined) {
        read_length_counts[read_length] = 0;
      }
      read_length_counts[read_length]++;

      if ((records[i].flag & 64) == 64) {
        paired_end_reads[records[i].readname].first = records[i];
      } else if ((records[i].flag & 128) == 128) {
        paired_end_reads[records[i].readname].second = records[i];
      } else {
        console.warn(
          "Read found that was not first or second in pair, despite flag indicating that this bam was paired-end"
        );
      }
    }

    var most_common_length = null;
    for (var length in read_length_counts) {
      if (
        most_common_length == null ||
        read_length_counts[length] > read_length_counts[most_common_length]
      ) {
        most_common_length = length;
      }
    }
    _ribbon_settings.default_read_length = parseInt(most_common_length);

    var glued_together = [];
    for (var readname in paired_end_reads) {
      var new_record = parse_paired_end(paired_end_reads[readname]);
      glued_together.push(new_record);
    }
    return glued_together;
  } else {
    // Check if any main alignments are not included in the SA tag of a previous entry for the same read,
    //		this happens for instance if SA tags are not set at all, so this section provides better support for BAM files like that.
    // 		One of those BAM files without SA tags comes from the GMAP aligner with IsoSeq data
    var unique_readname_pos_IDs = {};
    var unique_readnames = {};
    for (var i in records) {
      if (unique_readnames[records[i].readname] == undefined) {
        unique_readnames[records[i].readname] = records[i];
        for (var j in records[i].alignments) {
          unique_readname_pos_IDs[
            records[i].readname + records[i].alignments[j].r
          ] = true;
          // Add all alignments from main record
        }
      } else {
        // Add only the main alignment: records[i].alignments[0]
        if (
          unique_readname_pos_IDs[
            records[i].readname + records[i].alignments[0].r
          ] == undefined
        ) {
          unique_readnames[records[i].readname].alignments.push(
            records[i].alignments[0]
          );
          unique_readname_pos_IDs[
            records[i].readname + records[i].alignments[0].r
          ] = true;

          // Remake the SA tag so when we recalculate later (like for indels) it will get parsed correctly
          var strand = "+";
          if ((records[i].raw.flag & 16) == 16) {
            strand = "-";
          }
          new_SA_entry =
            records[i].raw.segment +
            "," +
            records[i].raw.pos +
            "," +
            strand +
            "," +
            records[i].raw.cigar +
            "," +
            records[i].raw.mq +
            ",0";
          if (unique_readnames[records[i].readname].raw.SA == "") {
            unique_readnames[records[i].readname].raw.SA = new_SA_entry;
          } else {
            unique_readnames[records[i].readname].raw.SA =
              unique_readnames[records[i].readname].raw.SA + ";" + new_SA_entry;
          }
        }
      }
    }

    var filtered_records = [];
    for (var readname in unique_readnames) {
      filtered_records.push(unique_readnames[readname]);
    }

    return filtered_records;
  }
}

function parse_coords_columns(columns) {
  //     [S1]     [E1]  |     [S2]     [E2]  |  [LEN 1]  [LEN 2]  |  [% IDY]  |  [LEN R]  [LEN Q]  | [TAGS]
  // ==========================================================================================================
  // 38231172 38246777  | 242528828 242513174  |    15606    15655  |    97.69  | 133797422 249250621  | chr10       1

  var alignment = {
    r: columns[9],
    rs: parseInt(columns[0]),
    re: parseInt(columns[1]),
    qs: parseInt(columns[2]),
    qe: parseInt(columns[3]),
    mq: parseFloat(columns[6]),
    read_length: parseInt(columns[8]),
    max_indel: null, // no indel in coordinates, disable the indel options upon null
  };
  alignment.aligned_length = Math.abs(alignment.re - alignment.rs);

  alignment.path = [];
  alignment.path.push({ R: alignment.rs, Q: alignment.qs });
  alignment.path.push({ R: alignment.re, Q: alignment.qe });

  return alignment;
}

function coords_input_changed(coords_input_value) {
  _ribbon_settings.current_input_type = "coords";

  // Uncheck match refs from region view checkbox by default
  _ribbon_settings.ref_match_chunk_ref_intervals = false;
  d3.select("#ref_match_region_view").property("checked", false);
  refresh_ui_for_new_dataset();
  reset_settings_for_new_dataset();

  clear_data();
  remove_bam_file();

  var input_text = coords_input_value.split("\n");
  _Ref_sizes_from_header = {};
  // _settings.min_indel_size = -1;

  var alignments_by_query = {};

  for (var i = 0; i < input_text.length; i++) {
    var columns = input_text[i].split(/\s+/);

    //     [S1]     [E1]  |     [S2]     [E2]  |  [LEN 1]  [LEN 2]  |  [% IDY]  |  [LEN R]  [LEN Q]  | [TAGS]
    // ==========================================================================================================
    // 38231172 38246777  | 242528828 242513174  |    15606    15655  |    97.69  | 133797422 249250621  | chr10       1

    if (columns.length == 11) {
      var readname = columns[10];
      if (alignments_by_query[readname] == undefined) {
        alignments_by_query[readname] = [];
      }
      alignments_by_query[readname].push(parse_coords_columns(columns));
      _Ref_sizes_from_header[columns[9]] = parseInt(columns[7]);
    } else if (columns.length < 3) {
      continue;
    } else if (columns.length != 11) {
      user_message_ribbon(
        "Error",
        "The coordinates must be the same as MUMmer's show-coords -lTH. This means 11 tab-separated columns without a header: <ol><li>Ref start</li><li>Ref end</li><li>Query start</li><li>Query end</li><li>Ref alignment length</li><li>Query alignment length</li><li>Percent Identity</li><li>Total reference length</li><li>Total query length</li><li>Reference name(chromosome)</li><li>Query_name</li></ol>"
      );
      refresh_visibility();
      return;
    }
  }

  _Chunk_alignments = [];
  for (var readname in alignments_by_query) {
    _Chunk_alignments.push({
      alignments: alignments_by_query[readname],
      raw_type: "coords",
      readname: readname,
    });
  }

  _focal_region = undefined;

  refresh_visibility();
  chunk_changed();
  d3.select("#text_region_output").html("Showing coordinate input");
}

function calculate_type_colors(variant_list) {
  var variant_types = {};
  for (var i in variant_list) {
    if (variant_types[variant_list[i].type] == undefined) {
      variant_types[variant_list[i].type] = 1;
    } else {
      variant_types[variant_list[i].type]++;
    }
  }
  var other_colors_index = 0;
  var colors_for_variants = [];
  var variant_names = [];
  for (var type in variant_types) {
    variant_names.push(type);
    if (
      type.toUpperCase().indexOf("DEL") != -1 ||
      type.toUpperCase().indexOf("PROTEIN") != -1
    ) {
      colors_for_variants.push("blue");
    } else if (
      type.toUpperCase().indexOf("INS") != -1 ||
      type.toUpperCase().indexOf("RNA") != -1
    ) {
      colors_for_variants.push("red");
    } else if (
      type.toUpperCase().indexOf("INV") != -1 ||
      type.toUpperCase().indexOf("PSEUDO") != -1
    ) {
      colors_for_variants.push("orange");
    } else if (type.toUpperCase().indexOf("TRA") != -1) {
      colors_for_variants.push("black");
    } else if (type.toUpperCase().indexOf("BND") != -1) {
      colors_for_variants.push("black");
    } else if (type.toUpperCase().indexOf("DUP") != -1) {
      colors_for_variants.push("green");
    } else if (variant_types[type] > 1) {
      colors_for_variants.push(
        _ribbon_static.color_collections[2][other_colors_index]
      );
      other_colors_index++;
    } else {
      colors_for_variants.push("#eeeeee");
    }
  }
  return { names: variant_names, colors: colors_for_variants };
}

function batch_bam_fetching(chrom, start, end, callback) {
  my_fetch(chrom, start, end, callback);
}

function flexible_bam_fetch(region_list) {
  _Additional_ref_intervals = [];

  if (_Bams != undefined) {
    show_waiting_for_bam();

    _num_bam_records_to_load = 0;
    _num_loaded_regions = 0;
    _Bam_records_from_multiregions = [];

    let fetch_whole_region = false;
    let region_fetch_margin = _ribbon_settings.bam_fetch_margin;

    if (fetch_whole_region == true) {
      for (var i in region_list) {
        my_fetch(
          region_list[i].chrom,
          region_list[i].start - region_fetch_margin,
          region_list[i].end + region_fetch_margin,
          use_additional_fetched_data
        );
        _Additional_ref_intervals.push({
          chrom: region_list[i].chrom,
          start: region_list[i].start - region_fetch_margin,
          end: region_list[i].end + region_fetch_margin,
        });
      }
    } else {
      for (var i in region_list) {
        _Additional_ref_intervals.push({
          chrom: region_list[i].chrom,
          start: region_list[i].start - region_fetch_margin,
          end: region_list[i].start + region_fetch_margin,
        });
        _Additional_ref_intervals.push({
          chrom: region_list[i].chrom,
          start: region_list[i].end - region_fetch_margin,
          end: region_list[i].end + region_fetch_margin,
        });
      }

      var ref_pieces = {};

      for (var i in _Additional_ref_intervals) {
        var region = _Additional_ref_intervals[i];
        if (ref_pieces[region.chrom] == undefined) {
          ref_pieces[region.chrom] = [];
        }
        var start = region.start;
        if (start < 0) {
          start = 0;
        }
        var end = region.end;
        ref_pieces[region.chrom].push([start, "s"]);
        ref_pieces[region.chrom].push([end, "e"]);
      }

      var ref_intervals_by_chrom = ref_intervals_from_ref_pieces(ref_pieces);
      _Additional_ref_intervals = [];
      for (var chrom in ref_intervals_by_chrom) {
        for (var i in ref_intervals_by_chrom[chrom]) {
          _Additional_ref_intervals.push({
            chrom: chrom,
            start: ref_intervals_by_chrom[chrom][i][0],
            end: ref_intervals_by_chrom[chrom][i][1],
          });
          batch_bam_fetching(
            chrom,
            ref_intervals_by_chrom[chrom][i][0],
            ref_intervals_by_chrom[chrom][i][1],
            use_additional_fetched_data
          );
        }
      }
    }
    var info = "Queried from bam file at: ";
    for (var i in _Additional_ref_intervals) {
      info +=
        _Additional_ref_intervals[i].chrom +
        ":" +
        _Additional_ref_intervals[i].start +
        "-" +
        _Additional_ref_intervals[i].end;
      if (i < _Additional_ref_intervals.length - 1) {
        info += ", ";
      }
    }
    d3.select("#bam_fetch_info").html(info);
  } else {
    user_message_ribbon("Error", "No bam file. Please load a bam file first from the 'Input alignments' tab.");
  }
}

function feature_row_click(d) {
  d3.select("#text_region_output").html(
    "Selected feature: " +
      d.name +
      " (" +
      d.type +
      ") at " +
      d.chrom +
      ":" +
      d.start +
      "-" +
      d.end
  );
  // Mark feature as selected:
  for (var i in _Features_for_ribbon) {
    _Features_for_ribbon[i].highlight = _Features_for_ribbon[i].name == d.name;
  }
  if (!_ribbon_warnings.large_features && d.end - d.start > 1000) {
    user_message_ribbon(
      "Warning",
      "Be careful with long features as loading too many reads can cause out-of-memory errors."
    );
    _ribbon_warnings.large_features = true;
  }
  flexible_bam_fetch([{ chrom: d.chrom, start: d.start, end: d.end }]);
}

function variant_row_click(d) {
  d3.select("#text_region_output").html(
    "Selected variant: " +
      d.name +
      " (" +
      d.type +
      ") at " +
      d.chrom +
      ":" +
      d.start +
      "-" +
      d.end
  );
  // Mark variant as selected:
  for (var i in _Variants) {
    _Variants[i].highlight = _Variants[i].name == d.name;
  }
  if (!_ribbon_warnings.large_features && d.end - d.start > 1000) {
    user_message_ribbon(
      "Warning",
      "Be careful with large regions as loading too many reads can cause out-of-memory errors."
    );
    _ribbon_warnings.large_features = true;
  }
  flexible_bam_fetch([{ chrom: d.chrom, start: d.start, end: d.end }]);
}

function check_bam_done_fetching() {
  if (_loading_bam_right_now == true) {
    return false;
  } else {
    return true;
  }
}

function show_feature_table() {
  d3.select("#feature_table_box").style("display", "block");

  d3.select("#feature_table_landing").call(
    SuperTable()
      .table_data(_Features_for_ribbon)
      .num_rows_to_show(1000)
      .click_function(feature_row_click)
      .show_advanced_filters(true)
  );
}
function show_variant_table() {
  d3.select("#variant_table_box").style("display", "block");

  d3.select("#ribbon_variant_table_landing").call(
    SuperTable()
      .table_data(_Variants)
      .num_rows_to_show(1000)
      .show_advanced_filters(true)
      .click_function(variant_row_click)
      .check_ready_function(check_bam_done_fetching)
  );
}
function bedpe_row_click(d) {
  flexible_bam_fetch([
    { chrom: d.chrom1, start: d.pos1, end: d.pos1 + 1 },
    { chrom: d.chrom2, start: d.pos2, end: d.pos2 + 1 },
  ]);

  d3.select("#text_region_output").html(
    "Selected bedpe variant: " +
      d.name +
      " (" +
      d.type +
      ") at " +
      d.chrom1 +
      ":" +
      d.pos1 +
      " and " +
      d.chrom2 +
      ":" +
      d.pos2
  );

  // Mark variant as selected:
  for (var i in _Bedpe) {
    _Bedpe[i].highlight = _Bedpe[i].name == d.name;
  }
}

function show_bedpe_table() {
  d3.select("#bedpe_table_panel").style("display", "block");

  d3.select("#bedpe_table_landing").call(
      SuperTable()
      .table_data(_Bedpe)
      .num_rows_to_show(1000)
      .show_advanced_filters(true)
      .click_function(bedpe_row_click)
      .table_header([
        "name",
        "type",
        "size",
        "chrom1",
        "pos1",
        "strand1",
        "chrom2",
        "pos2",
        "strand2",
      ])
      .check_ready_function(check_bam_done_fetching)
  );
  d3.select(".d3-superTable-table")
    .selectAll("input")
    .on("focus", function () {
      user_message_ribbon(
        "Instructions",
        "Filter table on each column by typing for instance =17 to get all rows where that column is 17, you can also do >9000 or <9000. Separate multiple filters in the same column with spaces."
      );
    });
}

function bedpe_input_changed(bedpe_input) {
  var input_text = bedpe_input.split("\n");
  // chrom1, start1, stop1, chrom2, start2, stop2, name, score, strand1, strand2, type

  _Bedpe = [];
  for (var i in input_text) {
    if (input_text[i][0] != "#") {
      var columns = input_text[i].split(/\s+/);
      if (columns.length > 2) {
        var chrom1 = columns[0];
        var start1 = parseInt(columns[1]);
        var end1 = parseInt(columns[2]);
        var chrom2 = columns[3];
        var start2 = parseInt(columns[4]);
        var end2 = parseInt(columns[5]);
        var name = columns[6];
        var score = parseFloat(columns[7]);
        var strand1 = columns[8];
        var strand2 = columns[9];
        var type = columns[10];
        // if (isNaN(score)) {
        // 	score = 0;
        // }
        if (isNaN(start1) || isNaN(end1)) {
          user_message_ribbon(
            "Error",
            "Bedpe file must contain numbers in columns 2,3,5, and 6. Found: <pre>" +
              columns[1] +
              ", " +
              columns[2] +
              ", " +
              columns[4] +
              ", and " +
              columns[5] +
              "</pre>."
          );
          return;
        }
        var pos1 = parseInt((start1 + end1) / 2);
        var pos2 = parseInt((start2 + end2) / 2);
        var size = Infinity;
        if (chrom1 == chrom2) {
          size = Math.abs(pos1 - pos2);
        }
        _Bedpe.push({
          name: name,
          score: score,
          variant_type: type,
          size: size,
          chrom1: chrom1,
          pos1: pos1,
          strand1: strand1,
          chrom2: chrom2,
          pos2: pos2,
          strand2: strand2,
          raw: input_text[i],
        });
      }
    }
  }

  update_bedpe();
  draw_region_view();
  refresh_ui_elements();
}

function update_variants() {
  var color_calculations = calculate_type_colors(_Variants);
  _ribbon_scales.variant_color_scale
    .domain(color_calculations.names)
    .range(color_calculations.colors);
  show_variant_table();
}

function update_bedpe() {
  var color_calculations = calculate_type_colors(_Bedpe);
  _ribbon_scales.variant_color_scale
    .domain(color_calculations.names)
    .range(color_calculations.colors);
  show_bedpe_table();
  // Put bedpe data into a global variable that SplitThreader can adopt.
  window.global_variants = _Bedpe;
}

function update_features() {
  var color_calculations = calculate_type_colors(_Features_for_ribbon);
  _ribbon_scales.feature_color_scale
    .domain(color_calculations.names)
    .range(color_calculations.colors);
  show_feature_table();
}

function vcf_input_changed(vcf_input) {
  var input_text = vcf_input.split("\n");

  _Variants = [];
  var ID_counter = 1;
  for (var i in input_text) {
    if (input_text[i][0] != "#") {
      var columns = input_text[i].split(/\s+/);
      if (columns.length >= 3) {
        var start = parseInt(columns[1]);
        var end = start;
        var type = "";
        var strand = "";
        var score = parseFloat(columns[4]);
        var name = columns[2];
        if (name == ".") {
          name = "#" + ID_counter;
          ID_counter++;
        }
        if (isNaN(score)) {
          score = 0;
        }
        if (isNaN(start) || isNaN(end)) {
          user_message_ribbon(
            "Error",
            "VCF file must contain a number in column 2. Found: <pre>" +
              columns[1] +
              "</pre>."
          );
          return;
        }
        if (columns[7] != undefined) {
          var info_fields = columns[7].split(";");
          for (var field in info_fields) {
            var info = info_fields[field].split("=");
            if (info.length == 2) {
              if (info[0] == "END") {
                end = parseInt(info[1]);
              } else if (info[0] == "TYPE" || info[0] == "SVTYPE") {
                type = info[1];
              } else if (info[0] == "STRAND") {
                strand = info[1];
              }
            }
          }
        }
        if (type == "") {
          type = columns[4];
        }
        _Variants.push({
          chrom: columns[0],
          start: start,
          end: end,
          size: end - start,
          name: name,
          score: score,
          strand: strand,
          variant_type: type,
        });
      }
    }
  }

  update_variants();
  draw_region_view();
  refresh_ui_elements();
}

function run_ribbon() {
  resize_ribbon_views();
  refresh_visibility();
}

function all_read_analysis() {
  var overall_max_mq = 0;
  var overall_min_mq = 100000000;
  var overall_max_num_alignments = 0;
  var max_readlength = 0;

  for (var j in _Chunk_alignments) {
    var read_record = _Chunk_alignments[j];
    _Chunk_alignments[j].index = j;
    // var all_chrs = {};
    var max_mq = 0;
    var min_mq = 10000000;
    if (read_record.alignments[0].read_length > max_readlength) {
      max_readlength = read_record.alignments[0].read_length;
    }

    // var min_mq = 100000;
    var index_longest = 0;
    for (var i in read_record.alignments) {
      if (read_record.alignments[i].mq > max_mq) {
        max_mq = read_record.alignments[i].mq;
      }
      if (read_record.alignments[i].mq < min_mq) {
        min_mq = read_record.alignments[i].mq;
      }

      if (
        read_record.alignments[i].aligned_length >
        read_record.alignments[index_longest].aligned_length
      ) {
        index_longest = i;
      }
      // all_chrs[read_record.alignments[i].r] = true;
    }
    _Chunk_alignments[j].index_longest = index_longest;

    _Chunk_alignments[j].max_mq = max_mq;
    if (max_mq > overall_max_mq) {
      overall_max_mq = max_mq;
    }
    if (min_mq < overall_min_mq) {
      overall_min_mq = min_mq;
    }

    if (_Chunk_alignments[j].alignments.length > overall_max_num_alignments) {
      overall_max_num_alignments = _Chunk_alignments[j].alignments.length;
    }

    _Chunk_alignments[j].index_primary =
      _Chunk_alignments[j].alignments.length - 1; // for sam and bam we put in the SA tags and then added the main alignment at the end
  }

  _ui_properties.region_mq_slider_max = overall_max_mq;
  _ui_properties.region_mq_slider_min = overall_min_mq;
  _ui_properties.num_alignments_slider_max = overall_max_num_alignments;
  _ui_properties.read_length_slider_max = max_readlength;

  _ribbon_settings.max_num_alignments = overall_max_num_alignments;
  _ribbon_settings.min_num_alignments = 1;
  _ribbon_settings.region_min_mapping_quality = overall_min_mq;
  _ribbon_settings.min_mapping_quality = overall_min_mq;
  // _settings.min_indel_size = _static.min_indel_size_for_region_view;
  _ribbon_settings.min_align_length = 0;
  // _settings.min_aligns_for_ref_interval = 0;
  _ribbon_settings.min_read_length = 0;
}

function feature_type_checkbox(d) {
  _ribbon_settings.feature_types_to_show[d.type] = d3.event.target.checked;
  apply_feature_filters();
  draw_region_view();
  draw();
}
function make_feature_type_table() {
  d3.select("#feature_filter_settings_div").style("display", "inline");

  var type_counts = {};
  _ribbon_settings.feature_types_to_show = {};

  for (var i in _Features_for_ribbon) {
    if (type_counts[_Features_for_ribbon[i].type] == undefined) {
      type_counts[_Features_for_ribbon[i].type] = 1;
      _ribbon_settings.feature_types_to_show[
        _Features_for_ribbon[i].type
      ] = false;
    } else {
      type_counts[_Features_for_ribbon[i].type]++;
    }
  }

  // Put into list so we can sort it
  var data_for_table = [];
  for (var type in type_counts) {
    data_for_table.push({ type: type, count: type_counts[type] });
  }
  data_for_table.sort(function (a, b) {
    return b.count - a.count;
  });

  var header = ["type", "count", "show"];
  d3.select("#feature_type_table").html("");
  d3.select("#feature_type_table")
    .append("tr")
    .selectAll("th")
    .data(header)
    .enter()
    .append("th")
    .html(function (d) {
      return d;
    });
  var rows = d3
    .select("#feature_type_table")
    .selectAll("tr.data")
    .data(data_for_table)
    .enter()
    .append("tr")
    .attr("class", "data");
  rows.append("td").html(function (d) {
    return d.type;
  });
  rows.append("td").html(function (d) {
    return d.count;
  });
  rows
    .append("td")
    .append("input")
    .property("type", "checkbox")
    .property("checked", false)
    .on("change", feature_type_checkbox);
}

function create_dropdowns() {
  d3.select("select#color_alignments_by")
    .selectAll("option")
    .data(_ribbon_static.color_alignments_by_options)
    .enter()
    .append("option")
    .text(function (d) {
      return d.description;
    })
    .property("value", function (d) {
      return d.id;
    })
    .property("selected", function (d) {
      return d.id === _ribbon_settings.color_alignments_by;
    });
  
  d3.select("select#color_alignments_by").on("change", function (d) {
    _ribbon_settings.color_alignments_by = this.options[this.selectedIndex].value;
    draw_region_view();
    draw();
  });

  d3.select("select#read_orientation_dropdown")
    .selectAll("option")
    .data(_ribbon_static.read_orientation_options)
    .enter()
    .append("option")
    .text(function (d) {
      return d.description;
    })
    .property("value", function (d) {
      return d.id;
    })
    .property("selected", function (d) {
      return d.id === _ribbon_settings.orient_reads_by;
    });

  d3.select("select#read_orientation_dropdown").on("change", function (d) {
    _ribbon_settings.orient_reads_by = this.options[this.selectedIndex].value;
    draw_region_view();
    draw();
  });

  d3.select("select#read_sorting_dropdown")
    .selectAll("option")
    .data(_ribbon_static.read_sort_options)
    .enter()
    .append("option")
    .text(function (d) {
      return d.description;
    })
    .property("value", function (d) {
      return d.id;
    })
    .property("selected", function (d) {
      return d.id === _ribbon_settings.feature_to_sort_reads;
    });

  d3.select("select#read_sorting_dropdown").on("change", function (d) {
    _ribbon_settings.feature_to_sort_reads =
      this.options[this.selectedIndex].value;
    draw_region_view();
  });

  d3.select("select#ribbon_color_scheme_dropdown")
    .selectAll("option")
    .data(_ribbon_static.color_schemes)
    .enter()
    .append("option")
    .text(function (d) {
      return d.name;
    })
    .property("value", function (d) {
      return d.colors;
    });

  d3.select("select#ribbon_color_scheme_dropdown").on("change", function (d) {
    _ribbon_settings.color_index = this.options[this.selectedIndex].value;
    _ribbon_scales.ref_color_scale.range(
      _ribbon_static.color_collections[_ribbon_settings.color_index]
    );
    draw_region_view();
    draw();
  });

  d3.select("select#show_indels_as_dropdown")
    .selectAll("option")
    .data(_ribbon_static.show_indels_as_options)
    .enter()
    .append("option")
    .text(function (d) {
      return d.description;
    })
    .property("value", function (d) {
      return d.id;
    })
    .property("selected", function (d) {
      return d.id === _ribbon_settings.show_indels_as;
    });

  d3.select("select#show_indels_as_dropdown").on("change", function (d) {
    _ribbon_settings.show_indels_as = this.options[this.selectedIndex].value;
    draw_region_view();
  });

  d3.select("select#show_features_as_dropdown")
    .selectAll("option")
    .data(_ribbon_static.show_features_as_options)
    .enter()
    .append("option")
    .text(function (d) {
      return d.description;
    })
    .property("value", function (d) {
      return d.id;
    })
    .property("selected", function (d) {
      return d.id === _ribbon_settings.show_features_as;
    });

  d3.select("select#show_features_as_dropdown").on("change", function (d) {
    _ribbon_settings.show_features_as = this.options[this.selectedIndex].value;
    draw_region_view();
    draw();
  });
}

function reset_settings_for_new_dataset() {
  if (_ribbon_settings.current_input_type == "coords") {
    _ribbon_settings.orient_reads_by = "longest";
    _ribbon_settings.show_indels_as = "none";
    d3.select(".when_bam_file_only").style("display", "none");
  } else if (
    _ribbon_settings.current_input_type == "sam" ||
    _ribbon_settings.current_input_type == "bam"
  ) {
    d3.select(".when_bam_file_only").style("display", "block");
    _ribbon_settings.orient_reads_by = "primary";
    _ribbon_settings.show_indels_as = "thin";
  }
}

function refresh_ui_for_new_dataset() {
  if (_ribbon_settings.current_input_type == "coords") {
    $("#min_mq_title").html("Minimum % identity: ");
    $("#mq_slider").slider("option", "step", 0.01);
    $("#region_min_mq_title").html("Minimum % identity of best alignment:");
    $("#region_mq_slider").slider("option", "step", 0.01);

    d3.selectAll(".hide_for_coords").style("color", "#dddddd");
    // Disable indel size slider
    $("#indel_size_slider").slider("option", "disabled", true);

    // Disable header refs only checkbox
    $("#only_header_refs_checkbox").attr("disabled", true);

    $("#show_indels_as_dropdown").attr("disabled", true);
  } else if (
    _ribbon_settings.current_input_type == "sam" ||
    _ribbon_settings.current_input_type == "bam"
  ) {
    $("#min_mq_title").html("Minimum mapping quality: ");
    $("#mq_slider").slider("option", "step", 1);
    $("#region_min_mq_title").html(
      "Minimum mapping quality of best alignment:"
    );
    $("#region_mq_slider").slider("option", "step", 1);

    d3.selectAll(".hide_for_coords").style("color", "black");
    // Enable indel size slider
    $("#indel_size_slider").slider("option", "disabled", false);

    // Enable header refs only checkbox
    $("#only_header_refs_checkbox").attr("disabled", false);
    $("#show_indels_as_dropdown").attr("disabled", false);
  }

  create_dropdowns();
}

function refresh_ui_elements() {
  if (_Variants.length > 0 || _Bedpe.length > 0) {
    d3.selectAll(".when_variants_only").style("color", "black");
    $("#show_only_selected_variants").attr("disabled", false);
  } else {
    d3.selectAll(".when_variants_only").style("color", "#dddddd");
    $("#show_only_selected_variants").attr("disabled", true);
  }
  if (_Features_for_ribbon.length > 0) {
    d3.selectAll(".when_features_only").style("color", "black");
    $("#show_features_as_dropdown").attr("disabled", false);
  } else {
    d3.selectAll(".when_features_only").style("color", "#dddddd");
    $("#show_features_as_dropdown").attr("disabled", true);
  }

  // Mapping quality in region view
  $("#region_mq_slider").slider(
    "option",
    "max",
    _ui_properties.region_mq_slider_max
  );
  $("#region_mq_slider").slider(
    "option",
    "min",
    _ui_properties.region_mq_slider_min
  );
  $("#region_mq_slider").slider(
    "option",
    "value",
    _ribbon_settings.region_min_mapping_quality
  );
  $("#region_mq_label").html(_ribbon_settings.region_min_mapping_quality);

  $("#max_ref_length_slider").slider(
    "option",
    "max",
    _ui_properties.ref_length_slider_max
  );
  $("#max_ref_length_slider").slider(
    "option",
    "value",
    _ribbon_settings.max_ref_length
  );
  d3.select("#max_ref_length_input").property(
    "value",
    _ribbon_settings.max_ref_length
  );

  $("#min_read_length_slider").slider(
    "option",
    "max",
    _ui_properties.read_length_slider_max
  );
  $("#min_read_length_slider").slider(
    "option",
    "value",
    _ribbon_settings.min_read_length
  );
  d3.select("#min_read_length_input").property(
    "value",
    _ribbon_settings.min_read_length
  );

  // Number of alignments in region view
  $("#num_aligns_range_slider").slider(
    "option",
    "max",
    _ui_properties.num_alignments_slider_max
  );
  $("#num_aligns_range_slider").slider(
    "values",
    0,
    _ribbon_settings.min_num_alignments
  );
  $("#num_aligns_range_slider").slider(
    "values",
    1,
    _ribbon_settings.max_num_alignments
  );
  $("#num_aligns_range_label").html(
    "" +
      _ribbon_settings.min_num_alignments +
      " - " +
      _ribbon_settings.max_num_alignments
  );

  // Mapping quality in read detail view
  $("#mq_slider").slider("option", "max", _ui_properties.mq_slider_max);
  $("#mq_slider").slider("option", "min", _ui_properties.region_mq_slider_min);
  $("#mq_slider").slider(
    "option",
    "value",
    _ribbon_settings.min_mapping_quality
  );
  $("#mq_label").html(_ribbon_settings.min_mapping_quality);

  // Indel size in read detail view
  $("#indel_size_slider").slider(
    "option",
    "max",
    _ui_properties.indel_size_slider_max + 1
  );
  $("#indel_size_slider").slider(
    "option",
    "value",
    _ribbon_settings.min_indel_size
  );
  $("#indel_size_label").html(_ribbon_settings.min_indel_size);

  // Alignment length in read detail view
  $("#align_length_slider").slider(
    "option",
    "max",
    _ui_properties.align_length_slider_max
  );
  $("#align_length_slider").slider(
    "option",
    "value",
    _ribbon_settings.min_align_length
  );
  $("#align_length_label").html(_ribbon_settings.min_align_length);

  // Minimum alignments for each reference interval
  $("#min_aligns_for_ref_interval_slider").slider(
    "option",
    "value",
    _ribbon_settings.min_aligns_for_ref_interval
  );
  $("#min_aligns_for_ref_interval_label").html(
    _ribbon_settings.min_aligns_for_ref_interval
  );

  // Dot plot vs. Ribbon plot
  if (_ribbon_settings.ribbon_vs_dotplot == "ribbon") {
    d3.selectAll(".ribbon_settings").style("display", "table-row");
    d3.selectAll(".dotplot_settings").style("display", "none");
    d3.select("#select_ribbon").property("checked", true);
    d3.select("#select_dotplot").property("checked", false);
  } else {
    d3.selectAll(".dotplot_settings").style("display", "table-row");
    d3.selectAll(".ribbon_settings").style("display", "none");
    d3.select("#select_dotplot").property("checked", true);
    d3.select("#select_ribbon").property("checked", false);
  }

  // All checkboxes
  d3.select("#ref_match_region_view").property(
    "checked",
    _ribbon_settings.ref_match_chunk_ref_intervals
  );
  d3.select("#colors_checkbox").property("checked", _ribbon_settings.colorful);
  d3.select("#show_only_selected_variants").property(
    "checked",
    _ribbon_settings.show_only_selected_variants
  );
  d3.select("#highlight_selected_read").property(
    "checked",
    _ribbon_settings.highlight_selected_read
  );
  d3.select("#outline_checkbox").property(
    "checked",
    _ribbon_settings.ribbon_outline
  );

  // All dropdowns
  d3.select("select#read_orientation_dropdown")
    .selectAll("option")
    .property("selected", function (d) {
      return d.id === _ribbon_settings.orient_reads_by;
    });
  d3.select("select#read_sorting_dropdown")
    .selectAll("option")
    .property("selected", function (d) {
      return d.id === _ribbon_settings.feature_to_sort_reads;
    });
  d3.select("select#ribbon_color_scheme_dropdown")
    .selectAll("option")
    .property("selected", function (d) {
      return d.id === _ribbon_settings.color_index;
    });
  d3.select("select#show_indels_as_dropdown")
    .selectAll("option")
    .property("selected", function (d) {
      return d.id === _ribbon_settings.show_indels_as;
    });
  d3.select("select#show_features_as_dropdown")
    .selectAll("option")
    .property("selected", function (d) {
      return d.id === _ribbon_settings.show_features_as;
    });
}

function parse_cigar(cigar_string) {
  var cigar_regex = /(\d+)(\D)/;
  var parsed = cigar_string.split(cigar_regex);
  if (parsed.length < 2) {
    user_message_ribbon(
      "Error",
      "This doesn't look like a SAM/BAM file. The 6th column must be a valid cigar string."
    );
    console.error("Failed cigar string:", cigar_string);
    throw "input error: not a valid cigar string";
  }
  var results = [];
  for (var i = 0; i < parsed.length; i++) {
    if (parsed[i] != "") {
      results.push(parsed[i]);
    }
  }
  var output = [];
  for (var i = 0; i < results.length - 1; i += 2) {
    output.push({ num: parseInt(results[i]), type: results[i + 1] });
  }
  return output;
}

function parse_SA_field(sa) {
  var alignments = [];
  var aligns = sa.split(";");
  for (var i = 0; i < aligns.length; i++) {
    var fields = aligns[i].split(",");
    if (fields.length >= 6) {
      var chrom = fields[0];
      var rstart = parseInt(fields[1]);
      var raw_cigar = fields[3];
      var strand = fields[2];
      var mq = parseInt(fields[4]);

      alignments.push(read_cigar(raw_cigar, chrom, rstart, strand, mq));
    } else if (fields.length > 1) {
      console.warn(
        "ignoring alternate alignment because it doesn't have all 6 columns:",
        fields
      );
    }
  }

  return alignments;
}

export function user_message_ribbon(message_type, message) {
  user_message(message_type, message, "#user_message_ribbon");
}

function cigar_coords(cigar) {
  // cigar must already be parsed using parse_cigar()

  var coords = {};
  coords.read_alignment_length = 0;
  coords.ref_alignment_length = 0;

  coords.front_padding_length = 0; // captures S/H clipping at the beginning of the cigar string (what the ref considers the start location)
  coords.end_padding_length = 0; // captures S/H clipping at the end of the cigar string (what the ref considers the end location)

  var no_matches_yet = true;
  for (var i = 0; i < cigar.length; i++) {
    var num = cigar[i].num;
    switch (cigar[i].type) {
      case "H":
        if (no_matches_yet) {
          coords.front_padding_length += num;
        } else {
          coords.end_padding_length += num;
        }
        break;
      case "S":
        if (no_matches_yet) {
          coords.front_padding_length += num;
        } else {
          coords.end_padding_length += num;
        }
        break;
      case "M":
        no_matches_yet = false;
        coords.read_alignment_length += num;
        coords.ref_alignment_length += num;
        break;
      case "=":
        no_matches_yet = false;
        coords.read_alignment_length += num;
        coords.ref_alignment_length += num;
        break;
      case "X":
        no_matches_yet = false;
        coords.read_alignment_length += num;
        coords.ref_alignment_length += num;
        break;
      case "I":
        no_matches_yet = false;
        coords.read_alignment_length += num;
        break;
      case "D":
        no_matches_yet = false;
        coords.ref_alignment_length += num;
        break;
      case "N": // "Skipped region from the reference" -- sam format specification
        no_matches_yet = false;
        coords.ref_alignment_length += num;
        break;
      case "P": // "Padding: silent deletion from padded reference" -- sam format specification
        no_matches_yet = false;
        coords.ref_alignment_length += num;
        break;
      default:
        console.warn(
          "Unrecognized cigar character: ",
          cigar[i].type,
          ". As a fallback, we will assume it advances both query and reference, like a match or mismatch"
        );
        coords.read_alignment_length += num;
        coords.ref_alignment_length += num;
    }
  }
  return coords;
}
function read_cigar(unparsed_cigar, chrom, rstart, strand, mq) {
  var cigar = parse_cigar(unparsed_cigar);

  //////   Read cigar string for
  var coordinates = cigar_coords(cigar);

  var alignment = {};
  alignment.r = chrom;
  alignment.rs = rstart;
  alignment.re = rstart + coordinates.ref_alignment_length;

  if (strand == "+") {
    alignment.qs = coordinates.front_padding_length;
    alignment.qe =
      coordinates.front_padding_length + coordinates.read_alignment_length;
  } else {
    alignment.qe = coordinates.end_padding_length;
    alignment.qs =
      coordinates.end_padding_length + coordinates.read_alignment_length;
  }

  alignment.read_length =
    coordinates.front_padding_length +
    coordinates.read_alignment_length +
    coordinates.end_padding_length;
  alignment.mq = mq;
  alignment.max_indel = 0;
  alignment.aligned_length = coordinates.read_alignment_length;

  /////////     Now we run through the cigar string to capture the features     //////////
  alignment.path = [];
  // Add start coordinate to path before we begin
  alignment.path.push({ R: alignment.rs, Q: alignment.qs });

  // Running counters of read and reference positions:
  var read_pos = 0;
  var step = 1;
  if (strand == "-") {
    read_pos = alignment.read_length; // start at the end of the cigar string
    step = -1; // move backwards towards the front of the cigar string
  }
  var ref_pos = rstart;

  for (var i = 0; i < cigar.length; i++) {
    var num = cigar[i].num;
    switch (cigar[i].type) {
      case "H":
      case "S":
        read_pos += step * num;
        break;
      case "M":
      case "=":
      case "X":
        read_pos += step * num;
        ref_pos += num;
        break;
      case "I":
        if (
          _ribbon_settings.min_indel_size != -1 &&
          num >= _ribbon_settings.min_indel_size
        ) {
          alignment.path.push({ R: ref_pos, Q: read_pos });
          alignment.path.push({ R: ref_pos, Q: read_pos + step * num });
        }
        if (num > alignment.max_indel) {
          alignment.max_indel = num;
        }
        read_pos += step * num;
        break;
      case "D":
        if (
          _ribbon_settings.min_indel_size != -1 &&
          num >= _ribbon_settings.min_indel_size
        ) {
          alignment.path.push({ R: ref_pos, Q: read_pos });
          alignment.path.push({ R: ref_pos + num, Q: read_pos });
        }
        if (num > alignment.max_indel) {
          alignment.max_indel = num;
        }
        ref_pos += num;
        break;
      case "N": // "Skipped region from the reference" -- sam format specification
        alignment.path.push({ R: ref_pos, Q: read_pos });
        alignment.path.push({ R: ref_pos + num, Q: read_pos });
        ref_pos += num;
        break;
      case "P": // "Padding: silent deletion from padded reference" -- sam format specification
        ref_pos += num;
        break;
      default:
        console.warn(
          "Unrecgonized cigar character: ",
          cigar[i].type,
          ", assuming it advances both query and reference, like a match or mismatch"
        );
        read_pos += step * num;
        ref_pos += num;
    }
  }
  // alignment.max_indel
  alignment.path.push({ R: alignment.re, Q: alignment.qe });
  return alignment;
}

function parse_sam_coordinates(line) {
  var fields = line.split(/\s+/);
  var record = {};
  record.segment = fields[2];
  record.pos = parseInt(fields[3]);
  record.flag = parseInt(fields[1]);
  record.mq = parseInt(fields[4]);
  record.cigar = fields[5];
  record.readName = fields[0];

  for (var i = 0; i < fields.length; i++) {
    if (fields[i].substr(0, 2) == "SA") {
      record.SA = fields[i].split(":")[2];
      break;
    }
  }
  return parse_bam_record(record);
}

function planesweep_consolidate_intervals(starts_and_stops) {
  // Add margin to the stop points
  for (var i = 0; i < starts_and_stops.length; i++) {
    if (starts_and_stops[i][1] == "e") {
      starts_and_stops[i][0] =
        starts_and_stops[i][0] + _ribbon_settings.margin_to_merge_ref_intervals;
    }
  }

  starts_and_stops.sort(function (a, b) {
    return a[0] - b[0];
  });

  var intervals = [];
  var coverage = 0;
  var alignment_count = 0;
  var most_recent_start = -1;
  for (var i = 0; i < starts_and_stops.length; i++) {
    if (starts_and_stops[i][1] == "s") {
      coverage++;
      alignment_count++;
      if (coverage == 1) {
        // coverage was 0, now starting new interval
        most_recent_start = starts_and_stops[i][0];
      }
    } else if (starts_and_stops[i][1] == "e") {
      coverage--;
      if (coverage == 0) {
        // coverage just became 0, ending current interval
        // Remove margin from the final stop point before recording, avoiding margins on the edges of the intervals
        intervals.push([
          most_recent_start,
          starts_and_stops[i][0] -
            _ribbon_settings.margin_to_merge_ref_intervals,
          alignment_count,
        ]);
        alignment_count = 0; // reset
      }
    } else {
      console.error(
        "ERROR: unrecognized code in planesweep_consolidate_intervals must be s or e"
      );
    }
  }

  return intervals;
}

function reparse_read(record_from_chunk) {
  if (record_from_chunk.raw_type == "sam") {
    return parse_sam_coordinates(record_from_chunk.raw);
  } else if (record_from_chunk.raw_type == "bam") {
    return parse_bam_record(record_from_chunk.raw);
  } else if (record_from_chunk.raw_type == "coords") {
    return record_from_chunk; // no indels
  } else if (record_from_chunk.raw_type == "paired-end") {
    return parse_paired_end(record_from_chunk.raw);
  } else {
    throw new Error(
      `Unrecognized type: "${record_from_chunk.raw_type}" as record_from_chunk.raw_type, must be sam or bam`
    );
  }
}

function new_read_selected(index) {
  _current_read_index = index;
  select_read();
  _ribbon_svg2.selectAll("g.alignment_groups").attr("id", function (d) {
    if (
      d.index == _current_read_index &&
      _ribbon_settings.highlight_selected_read
    ) {
      return "selected_read_in_region_view";
    } else {
      return "";
    }
  });
}

function select_read() {
  if (
    _Chunk_alignments.length == 0 ||
    _current_read_index == undefined ||
    _current_read_index >= _Chunk_alignments.length
  ) {
    return;
  }
  if (_Chunk_alignments[_current_read_index] == undefined) {
    console.warn(
      "_Chunk_alignments[_current_read_index] = undefined)",
      "_current_read_index: ",
      _current_read_index,
      "_Chunk_alignments: ",
      _Chunk_alignments
    );
  }

  // Show read info
  d3.select("#text_read_output").html(
    "Read name: " +
      _Chunk_alignments[_current_read_index].readname +
      "<br>Number of alignments: " +
      _Chunk_alignments[_current_read_index].alignments.length
  );

  // d3.select("#text_read_output").property("value","Read name: " + _Chunk_alignments[_current_read_index].readname + "\n" + "Number of alignments: " + _Chunk_alignments[_current_read_index].alignments.length );

  //  + "\n" + "Number of alignments: " + _Chunk_alignments[_current_read_index].alignments.length

  // _settings.min_indel_size = 1000000000; // parse alignments for new read first without indels
  _Alignments = reparse_read(_Chunk_alignments[_current_read_index]).alignments;

  _ui_properties.mq_slider_max = 0;
  _ui_properties.indel_size_slider_max = 0;
  _ui_properties.align_length_slider_max = 0;
  for (var i in _Alignments) {
    var alignment = _Alignments[i];
    if (alignment.mq > _ui_properties.mq_slider_max) {
      _ui_properties.mq_slider_max = alignment.mq;
    }
    if (alignment.max_indel > _ui_properties.indel_size_slider_max) {
      _ui_properties.indel_size_slider_max = alignment.max_indel;
    }
    if (alignment.aligned_length > _ui_properties.align_length_slider_max) {
      _ui_properties.align_length_slider_max = alignment.aligned_length;
    }
  }

  _ribbon_settings.min_align_length = 0;
  if (
    _ribbon_settings.min_indel_size ==
    _ribbon_static.min_indel_size_for_region_view
  ) {
    _ribbon_settings.min_indel_size = _ui_properties.indel_size_slider_max + 1;
  }

  if (_ribbon_settings.ref_match_chunk_ref_intervals) {
    organize_refs_for_read_same_as_chunk();
  } else {
    organize_references_for_read();
  }

  _ribbon_scales.read_scale.domain([
    0,
    _Alignments[_Alignments.length - 1].read_length,
  ]);

  refresh_visibility();
  refresh_ui_elements();
  draw();
}

// Natural sort is from: http://web.archive.org/web/20130826203933/http://my.opera.com/GreyWyvern/blog/show.dml/1671288
function natural_sort(a, b) {
  function chunk(t) {
    var tz = [],
      x = 0,
      y = -1,
      n = 0,
      i,
      j;

    while ((i = (j = t.charAt(x++)).charCodeAt(0))) {
      var m = i == 46 || (i >= 48 && i <= 57);
      if (m !== n) {
        tz[++y] = "";
        n = m;
      }
      tz[y] += j;
    }
    return tz;
  }

  var aa = chunk(a);
  var bb = chunk(b);

  for (let x = 0; aa[x] && bb[x]; x++) {
    if (aa[x] !== bb[x]) {
      var c = Number(aa[x]),
        d = Number(bb[x]);
      if (c == aa[x] && d == bb[x]) {
        return c - d;
      } else return aa[x] > bb[x] ? 1 : -1;
    }
  }
  return aa.length - bb.length;
}

function ribbon_alignment_path_generator(d) {
  var bottom_y = _positions.read.y;
  var top_y =
    _positions.singleread.bottom_bar.y +
    _positions.singleread.bottom_bar.height;

  function get_top_coords(datum, index) {
    // if ((_settings.ref_match_chunk_ref_intervals == false) || (_Refs_show_or_hide[datum.r] && d.num_alignments >= _settings.min_aligns_for_ref_interval)) {
    var cum_pos = map_ref_interval(datum.r, datum.path[index].R);
    if (cum_pos != undefined) {
      return (
        _ribbon_scales.ref_interval_scale(
          map_ref_interval(datum.r, datum.path[index].R)
        ) +
        "," +
        top_y
      );
    } else {
      return (
        _ribbon_scales.read_scale(datum.path[index].Q) +
        " " +
        (top_y + ((bottom_y - top_y) * 2) / 3)
      );
    }
  }

  var output = "M " + get_top_coords(d, 0); // ref start
  output += " L " + _ribbon_scales.read_scale(d.path[0].Q) + " " + bottom_y; // read start

  for (var i = 1; i < d.path.length; i++) {
    var ref_coord = " L " + get_top_coords(d, i); // ref
    var read_coord =
      " L " + _ribbon_scales.read_scale(d.path[i].Q) + " " + bottom_y; // read
    if (i % 2 == 0) {
      // alternate reference and read side so top goes to top
      output += ref_coord + read_coord;
    } else {
      output += read_coord + ref_coord;
    }
  }

  output += " L " + get_top_coords(d, 0); // ref start
  output += " L " + _ribbon_scales.read_scale(d.path[0].Q) + " " + bottom_y; // read start

  return output;
}

function ref_mapping_path_generator(d, chunk) {
  var bottom = {};
  var top = {};

  if (chunk == true) {
    bottom.y = _positions.multiread.ref_intervals.y;
    bottom.left = _ribbon_scales.chunk_ref_interval_scale(d.cum_pos);
    bottom.right =
      bottom.left +
      _ribbon_scales.chunk_ref_interval_scale(d.end) -
      _ribbon_scales.chunk_ref_interval_scale(d.start);

    top.y =
      _positions.multiread.ref_block.y + _positions.multiread.ref_block.height;
    top.left = _ribbon_scales.chunk_whole_ref_scale(
      map_chunk_whole_ref(d.chrom, d.start)
    );
    top.right = _ribbon_scales.chunk_whole_ref_scale(
      map_chunk_whole_ref(d.chrom, d.end)
    );
  } else {
    bottom.y = _positions.singleread.top_bar.y;
    bottom.left = _ribbon_scales.ref_interval_scale(d.cum_pos);
    bottom.right =
      bottom.left +
      _ribbon_scales.ref_interval_scale(d.end) -
      _ribbon_scales.ref_interval_scale(d.start);

    top.y =
      _positions.singleread.ref_block.y +
      _positions.singleread.ref_block.height;
    top.left = _ribbon_scales.whole_ref_scale(map_whole_ref(d.chrom, d.start));
    top.right = _ribbon_scales.whole_ref_scale(map_whole_ref(d.chrom, d.end));
  }

  return (
    "M " +
    bottom.left +
    " " +
    bottom.y +
    " L " +
    bottom.right +
    " " +
    bottom.y +
    " L " +
    top.right +
    " " +
    top.y +
    " L " +
    top.left +
    " " +
    top.y +
    " L " +
    bottom.left +
    " " +
    bottom.y
  );
}

function map_whole_ref(chrom, position) {
  // _Whole_refs has chrom, size, cum_pos

  for (var i = 0; i < _Whole_refs.length; i++) {
    if (_Whole_refs[i].chrom == chrom) {
      return _Whole_refs[i].cum_pos + position;
    }
  }
  return undefined;
}
function map_chunk_whole_ref(chrom, position) {
  // _Whole_refs has chrom, size, cum_pos

  for (var i = 0; i < _Whole_refs.length; i++) {
    if (_Whole_refs[i].chrom == chrom) {
      return _Whole_refs[i].filtered_cum_pos + position;
    }
  }
  return undefined;
}

function map_ref_interval(chrom, position) {
  // _Ref_intervals has chrom, start, end, size, cum_pos
  for (var i = 0; i < _Ref_intervals.length; i++) {
    if (_Ref_intervals[i].chrom == chrom && _Ref_intervals[i].cum_pos != -1) {
      if (
        position >= _Ref_intervals[i].start &&
        position <= _Ref_intervals[i].end
      ) {
        return _Ref_intervals[i].cum_pos + (position - _Ref_intervals[i].start);
      }
    }
  }
  return undefined;
}

function map_chunk_ref_interval(chrom, position) {
  // _Chunk_ref_intervals has chrom, start, end, size, cum_pos
  for (var i = 0; i < _Chunk_ref_intervals.length; i++) {
    if (
      _Chunk_ref_intervals[i].chrom == chrom &&
      _Chunk_ref_intervals[i].cum_pos != -1
    ) {
      if (
        position >= _Chunk_ref_intervals[i].start &&
        position <= _Chunk_ref_intervals[i].end
      ) {
        return (
          _Chunk_ref_intervals[i].cum_pos +
          (position - _Chunk_ref_intervals[i].start)
        );
      }
    }
  }

  return undefined;
}

function closest_map_ref_interval(chrom, position) {
  // _Ref_intervals has chrom, start, end, size, cum_pos
  var closest = 0;
  var best_distance = -1;
  for (var i = 0; i < _Ref_intervals.length; i++) {
    if (_Ref_intervals[i].chrom == chrom && _Ref_intervals[i].cum_pos != -1) {
      if (
        position >= _Ref_intervals[i].start &&
        position <= _Ref_intervals[i].end
      ) {
        return {
          precision: "exact",
          pos: _Ref_intervals[i].cum_pos + (position - _Ref_intervals[i].start),
        };
      }
      if (
        Math.abs(position - _Ref_intervals[i].start) < best_distance ||
        best_distance == -1
      ) {
        closest = _Ref_intervals[i].cum_pos;
        best_distance = Math.abs(position - _Ref_intervals[i].start);
      }
      if (Math.abs(position - _Ref_intervals[i].end) < best_distance) {
        closest =
          _Ref_intervals[i].cum_pos +
          _Ref_intervals[i].end -
          _Ref_intervals[i].start;
        best_distance = Math.abs(position - _Ref_intervals[i].end);
      }
    }
  }
  // If no exact match found by the end, return the closest
  if (best_distance != -1) {
    return { precision: "inexact", pos: closest };
  } else {
    return { precision: "none", pos: closest };
  }
}

function closest_map_chunk_ref_interval(chrom, position) {
  // _Chunk_ref_intervals has chrom, start, end, size, cum_pos
  var closest = 0;
  var best_distance = -1;
  for (var i in _Chunk_ref_intervals) {
    if (
      _Chunk_ref_intervals[i].chrom == chrom &&
      _Chunk_ref_intervals[i].cum_pos != -1
    ) {
      if (
        position >= _Chunk_ref_intervals[i].start &&
        position <= _Chunk_ref_intervals[i].end
      ) {
        return {
          precision: "exact",
          pos:
            _Chunk_ref_intervals[i].cum_pos +
            (position - _Chunk_ref_intervals[i].start),
        };
      }
      if (
        Math.abs(position - _Chunk_ref_intervals[i].start) < best_distance ||
        best_distance == -1
      ) {
        closest = _Chunk_ref_intervals[i].cum_pos;
        best_distance = Math.abs(position - _Chunk_ref_intervals[i].start);
      }
      if (Math.abs(position - _Chunk_ref_intervals[i].end) < best_distance) {
        closest =
          _Chunk_ref_intervals[i].cum_pos +
          _Chunk_ref_intervals[i].end -
          _Chunk_ref_intervals[i].start;
        best_distance = Math.abs(position - _Chunk_ref_intervals[i].end);
      }
    }
  }

  // If no exact match found by the end, return the closest
  if (best_distance != -1) {
    return { precision: "inexact", pos: closest };
  } else {
    return { precision: "none", pos: closest };
  }
}

function get_chromosome_sizes(ref_intervals_by_chrom) {
  var chromosomes = [];
  for (var chrom in ref_intervals_by_chrom) {
    chromosomes.push(chrom);
  }
  for (var chrom in _Ref_sizes_from_header) {
    if (chromosomes.indexOf(chrom) == -1) {
      chromosomes.push(chrom);
    }
  }

  chromosomes.sort(natural_sort);

  _ui_properties.ref_length_slider_max = 0;

  _Whole_refs = [];
  var cumulative_whole_ref_size = 0;
  for (var j = 0; j < chromosomes.length; j++) {
    var chrom = chromosomes[j];
    var intervals = ref_intervals_by_chrom[chrom];
    var new_ref_data = undefined;
    if (_Ref_sizes_from_header[chrom] == undefined) {
      var length_guess = intervals[intervals.length - 1][1] * 2;
      if (!_ribbon_settings.show_only_known_references) {
        new_ref_data = {
          chrom: chrom,
          size: length_guess,
          cum_pos: cumulative_whole_ref_size,
        };
        // cumulative_whole_ref_size += length_guess;
      }
    } else {
      new_ref_data = {
        chrom: chrom,
        size: _Ref_sizes_from_header[chrom],
        cum_pos: cumulative_whole_ref_size,
      };
      // cumulative_whole_ref_size += _Ref_sizes_from_header[chrom];
    }

    if (new_ref_data != undefined) {
      if (new_ref_data.size > _ui_properties.ref_length_slider_max) {
        _ui_properties.ref_length_slider_max = new_ref_data.size;
      }
      _Whole_refs.push(new_ref_data);
      cumulative_whole_ref_size += new_ref_data.size;
    }
  }

  _ribbon_settings.max_ref_length = _ui_properties.ref_length_slider_max;

  _ribbon_scales.whole_ref_scale.domain([0, cumulative_whole_ref_size]);
  _ribbon_scales.ref_color_scale.domain(chromosomes);
}

function ref_intervals_from_ref_pieces(ref_pieces) {
  // For each chromosome, consolidate intervals
  var ref_intervals_by_chrom = {};
  for (var chrom in ref_pieces) {
    ref_intervals_by_chrom[chrom] = planesweep_consolidate_intervals(
      ref_pieces[chrom]
    );

    if (_Ref_sizes_from_header[chrom] != undefined) {
      var chrom_sum = 0;
      var chrom_sum_num_alignments = 0;
      for (var i in ref_intervals_by_chrom[chrom]) {
        chrom_sum +=
          ref_intervals_by_chrom[chrom][i][1] -
          ref_intervals_by_chrom[chrom][i][0];
        chrom_sum_num_alignments += ref_intervals_by_chrom[chrom][i][2];
      }
      if (
        (chrom_sum * 1.0) / _Ref_sizes_from_header[chrom] >
        _ribbon_static.fraction_ref_to_show_whole
      ) {
        ref_intervals_by_chrom[chrom] = [
          [0, _Ref_sizes_from_header[chrom], chrom_sum_num_alignments],
        ];
      }
    }
  }
  return ref_intervals_by_chrom;
}
function organize_references_for_chunk() {
  ////////////////   Select reference chromosomes to show:   ////////////////////
  // Gather starts and ends for each chromosome
  var ref_pieces = {};
  for (var j = 0; j < _Chunk_alignments.length; j++) {
    let alignments = _Chunk_alignments[j].alignments;
    for (var i = 0; i < alignments.length; i++) {
      if (ref_pieces[alignments[i].r] == undefined) {
        ref_pieces[alignments[i].r] = [];
      }
      var interval = [alignments[i].rs, alignments[i].re];

      ref_pieces[alignments[i].r].push([Math.min.apply(null, interval), "s"]);
      ref_pieces[alignments[i].r].push([Math.max.apply(null, interval), "e"]);
    }
  }

  // If a focal region was specified from querying the bam file, be sure to include it
  if (_focal_region != undefined) {
    if (ref_pieces[_focal_region.chrom] == undefined) {
      ref_pieces[_focal_region.chrom] = [];
    }
    ref_pieces[_focal_region.chrom].push([_focal_region.start, "s"]);
    ref_pieces[_focal_region.chrom].push([_focal_region.end, "e"]);
  }

  if (_Additional_ref_intervals != undefined) {
    for (var i in _Additional_ref_intervals) {
      var region = _Additional_ref_intervals[i];
      if (ref_pieces[region.chrom] == undefined) {
        ref_pieces[region.chrom] = [];
      }
      var start = region.start - 1000;
      if (start < 0) {
        start = 0;
      }
      var end = region.end + 1000;
      ref_pieces[region.chrom].push([start, "s"]);
      ref_pieces[region.chrom].push([end, "e"]);
    }
  }

  var ref_intervals_by_chrom = ref_intervals_from_ref_pieces(ref_pieces);

  //////////////////////////////////////////////////////////
  get_chromosome_sizes(ref_intervals_by_chrom);

  var chromosomes = [];
  for (var chrom in ref_intervals_by_chrom) {
    chromosomes.push(chrom);
  }

  chromosomes.sort(natural_sort);

  // var longest_region = {};
  // var length_of_longest_region = 0;

  _Chunk_ref_intervals = [];
  var cumulative_position = 0;
  for (var j = 0; j < chromosomes.length; j++) {
    var chrom = chromosomes[j];
    var intervals = ref_intervals_by_chrom[chrom];
    for (var i in intervals) {
      _Chunk_ref_intervals.push({
        chrom: chrom,
        start: intervals[i][0],
        end: intervals[i][1],
        size: intervals[i][1] - intervals[i][0],
        cum_pos: cumulative_position,
        num_alignments: intervals[i][2],
      });
      var region_length = intervals[i][1] - intervals[i][0];
      cumulative_position += region_length;
      // if (region_length > length_of_longest_region) {
      // 	length_of_longest_region = region_length;
      // 	longest_region = {"chrom":chrom,"start":intervals[i][0],"end":intervals[i][1]};
      // }
    }
  }

  // if (_focal_region == undefined) {
  // 	_focal_region = longest_region;
  // }

  _ribbon_scales.chunk_ref_interval_scale.domain([0, cumulative_position]);

  refresh_visibility();
}

function organize_refs_for_read_same_as_chunk() {
  _Ref_intervals = _Chunk_ref_intervals;
  _ribbon_scales.ref_interval_scale.domain(
    _ribbon_scales.chunk_ref_interval_scale.domain()
  );
}

function organize_references_for_read() {
  ////////////////   Select reference chromosomes to show:   ////////////////////
  // Gather starts and ends for each chromosome
  var ref_pieces = {};
  for (var i = 0; i < _Alignments.length; i++) {
    if (ref_pieces[_Alignments[i].r] == undefined) {
      ref_pieces[_Alignments[i].r] = [];
    }
    var interval = [_Alignments[i].rs, _Alignments[i].re];

    ref_pieces[_Alignments[i].r].push([Math.min.apply(null, interval), "s"]);
    ref_pieces[_Alignments[i].r].push([Math.max.apply(null, interval), "e"]);
  }

  if (_focal_region != undefined) {
    if (ref_pieces[_focal_region.chrom] == undefined) {
      ref_pieces[_focal_region.chrom] = [];
    }
    ref_pieces[_focal_region.chrom].push([_focal_region.start, "s"]);
    ref_pieces[_focal_region.chrom].push([_focal_region.end, "e"]);
  }

  if (_Additional_ref_intervals != undefined) {
    for (var i in _Additional_ref_intervals) {
      var region = _Additional_ref_intervals[i];
      if (ref_pieces[region.chrom] == undefined) {
        ref_pieces[region.chrom] = [];
      }
      var start = region.start - 1000;
      if (start < 0) {
        start = 0;
      }
      var end = region.end + 1000;
      ref_pieces[region.chrom].push([start, "s"]);
      ref_pieces[region.chrom].push([end, "e"]);
    }
  }

  // For each chromosome, consolidate intervals
  var ref_intervals_by_chrom = ref_intervals_from_ref_pieces(ref_pieces);

  var chromosomes = [];
  for (var chrom in ref_intervals_by_chrom) {
    chromosomes.push(chrom);
  }

  chromosomes.sort(natural_sort);

  _Ref_intervals = [];
  var cumulative_position = 0;
  for (var j = 0; j < chromosomes.length; j++) {
    var chrom = chromosomes[j];
    var intervals = ref_intervals_by_chrom[chrom];
    for (var i = 0; i < intervals.length; i++) {
      _Ref_intervals.push({
        chrom: chrom,
        start: intervals[i][0],
        end: intervals[i][1],
        size: intervals[i][1] - intervals[i][0],
        cum_pos: cumulative_position,
      });
      cumulative_position += intervals[i][1] - intervals[i][0];
    }
  }

  _ribbon_scales.ref_interval_scale.domain([0, cumulative_position]);
}

function refresh_visibility() {
  if (_Whole_refs.length > 0 || _Chunk_alignments.length > 0) {
    d3.select("#svg2_panel").style("visibility", "visible");
    d3.select("#left_ribbon_examples").style("display", "none");
  } else {
    d3.select("#svg2_panel").style("visibility", "hidden");
    d3.select("#left_ribbon_examples").style("display", "block");
  }

  if (
    _Alignments.length > 0 ||
    (_ribbon_settings.automation_mode == true &&
      _Bams != undefined &&
      _Bedpe.length > 0)
  ) {
    d3.select("#svg1_panel").style("visibility", "visible");
  } else {
    d3.select("#svg1_panel").style("visibility", "hidden");
  }
  if (_Variants.length > 0 || _Bedpe.length > 0) {
    d3.selectAll(".hide_when_no_variants").style("display", "block");
  } else {
    d3.selectAll(".hide_when_no_variants").style("display", "none");
  }
}

function draw() {
  if (_Alignments.length == 0) {
    return;
  }
  adjust_singleread_layout();

  if (_ribbon_settings.ribbon_vs_dotplot == "dotplot") {
    draw_dotplot();
  } else {
    draw_ribbons();
  }
}

function reset_svg2() {
  ////////  Clear the svg to start drawing from scratch  ////////
  d3.select("#svg2_panel").selectAll("svg").remove();

  _ribbon_svg2 = d3
    .select("#svg2_panel")
    .append("svg")
    .attr("width", _layout.svg2_width)
    .attr("height", _layout.svg2_height)
    .attr("id", "svg_multi_read")
    .style("background-color", "#ffffff");

  _ribbon_svg2
    .append("text")
    .attr("id", "no_alignments_message")
    .attr("x", _layout.svg2_width / 2)
    .attr("y", _layout.svg2_height / 2)
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "middle");

  d3.select("#svg2_panel").style("visibility", "visible");
}

function reset_svg() {
  ////////  Clear the svg to start drawing from scratch  ////////
  d3.select("#svg1_panel").selectAll("svg").remove();

  _ribbon_svg1 = d3
    .select("#svg1_panel")
    .append("svg")
    .attr("width", _layout.svg_width)
    .attr("height", _layout.svg_height)
    .attr("id", "svg_single_read")
    .style("background-color", "#ffffff");
}

function dotplot_alignment_path_generator(d) {
  var previous_x = _ribbon_scales.ref_interval_scale(
    map_ref_interval(d.r, d.path[0].R)
  );
  var previous_y = _ribbon_scales.read_scale(d.path[0].Q);
  var output = "M " + previous_x + " " + previous_y;

  for (var i = 1; i < d.path.length; i++) {
    var current_x = _ribbon_scales.ref_interval_scale(
      map_ref_interval(d.r, d.path[i].R)
    );
    var current_y = _ribbon_scales.read_scale(d.path[i].Q);
    if (current_x == previous_x || current_y == previous_y) {
      output += " M " + current_x + " " + current_y;
    } else {
      output += " L " + current_x + " " + current_y;
    }
    previous_x = current_x;
    previous_y = current_y;
  }

  return output;
}

function draw_dotplot() {
  reset_svg();

  if (_Alignments == undefined || _Alignments == []) {
    return;
  }

  draw_singleread_header();
  _positions.dotplot.canvas = {
    x: _positions.singleread.ref_intervals.x,
    y:
      _positions.singleread.bottom_bar.y +
      _positions.singleread.bottom_bar.height,
    width: _positions.singleread.ref_intervals.width,
    height:
      _layout.svg_height -
      (_positions.singleread.bottom_bar.y +
        _positions.singleread.bottom_bar.height) -
      _layout.svg_height * 0.05,
  };

  var canvas = _ribbon_svg1
    .append("g")
    .attr("class", "dotplot_canvas")
    .attr(
      "transform",
      "translate(" +
        _positions.dotplot.canvas.x +
        "," +
        _positions.dotplot.canvas.y +
        ")"
    );
  canvas
    .append("rect")
    .style("fill", "#eeeeee")
    .attr("width", _positions.dotplot.canvas.width)
    .attr("height", _positions.dotplot.canvas.height);

  // Relative to canvas
  _positions.ref = {
    left: 0,
    right: _positions.dotplot.canvas.width,
    y: _positions.dotplot.canvas.height,
  };
  _positions.read = {
    top: 0,
    bottom: _positions.dotplot.canvas.height,
    x: _positions.dotplot.canvas.width,
  };

  // Draw read
  canvas
    .append("line")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", _positions.read.top)
    .attr("y2", _positions.read.bottom)
    .style("stroke-width", 1)
    .style("stroke", "black");
  _ribbon_svg1
    .append("text")
    .text("Read / Query")
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "hanging")
    .attr(
      "transform",
      "translate(" +
        0 +
        "," +
        (_positions.dotplot.canvas.y + _positions.dotplot.canvas.height / 2) +
        ")rotate(-90)"
    )
    .style("font-size", _positions.fontsize);

  // Draw ref
  canvas
    .append("line")
    .attr("x1", _positions.ref.left)
    .attr("x2", _positions.ref.right)
    .attr("y1", _positions.ref.y)
    .attr("y2", _positions.ref.y)
    .style("stroke-width", 1)
    .style("stroke", "black");
  _ribbon_svg1
    .append("text")
    .text("Reference")
    .attr(
      "x",
      _positions.dotplot.canvas.x + _positions.dotplot.canvas.width / 2
    )
    .attr("y", _layout.svg_height)
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "ideographic")
    .style("font-size", _positions.fontsize);

  _ribbon_scales.ref_interval_scale.range([
    _positions.ref.left,
    _positions.ref.right,
  ]);

  canvas
    .selectAll("rect.ref_interval")
    .data(_Ref_intervals)
    .enter()
    .append("rect")
    .attr("class", "ref_interval")
    .filter(function (d) {
      return d.cum_pos != -1;
    })
    .attr("x", function (d) {
      return _ribbon_scales.ref_interval_scale(d.cum_pos);
    })
    .attr("y", 0)
    .attr("width", function (d) {
      return (
        _ribbon_scales.ref_interval_scale(d.end) -
        _ribbon_scales.ref_interval_scale(d.start)
      );
    })
    .attr("height", _positions.dotplot.canvas.height)
    .attr("fill", function (d) {
      if (_ribbon_settings.colorful) {
        return _ribbon_scales.ref_color_scale(d.chrom);
      } else {
        return "white";
      }
    })
    .style("stroke-width", 1)
    .style("stroke", "black")
    .on("mouseover", function (d) {
      var text =
        d.chrom + ": " + comma_format(d.start) + " - " + comma_format(d.end);
      var x =
        _positions.dotplot.canvas.x +
        _ribbon_scales.ref_interval_scale(d.cum_pos + (d.end - d.start) / 2);
      var y =
        _positions.dotplot.canvas.y +
        _positions.dotplot.canvas.height +
        _ribbon_padding.text;
      show_ribbon_tooltip(text, x, y, _ribbon_svg1);
    })
    .on("mouseout", function (d) {
      _ribbon_svg1.selectAll("g.tip").remove();
    })
    .style("stroke-opacity", 0.5)
    .attr("fill-opacity", _ribbon_static.dotplot_ref_opacity);

  // Alignments
  var flip = false;

  if (_ribbon_settings.orient_reads_by == "primary") {
    var primary_alignment =
      _Chunk_alignments[_current_read_index].alignments[
        _Chunk_alignments[_current_read_index].index_primary
      ];
    flip = primary_alignment.qe - primary_alignment.qs < 0;
  } else if (_ribbon_settings.orient_reads_by == "longest") {
    var longest_alignment =
      _Chunk_alignments[_current_read_index].alignments[
        _Chunk_alignments[_current_read_index].index_longest
      ];
    flip = longest_alignment.qe - longest_alignment.qs < 0;
  } else if (_ribbon_settings.orient_reads_by == "reverse") {
    flip = true;
  } else {
    flip = false;
  }

  if (flip == true) {
    _ribbon_scales.read_scale.range([
      _positions.read.top,
      _positions.read.bottom,
    ]);
  } else {
    _ribbon_scales.read_scale.range([
      _positions.read.bottom,
      _positions.read.top,
    ]);
  }

  var a_groups = canvas
    .selectAll("g.alignment")
    .data(_Alignments)
    .enter()
    .append("g")
    .attr("class", "alignment");
  a_groups
    .append("path")
    .filter(function (d) {
      return (
        d.mq >= _ribbon_settings.min_mapping_quality &&
        d.aligned_length >= _ribbon_settings.min_align_length
      );
    })
    .filter(function (d) {
      return (
        map_ref_interval(d.r, d.rs) != undefined &&
        map_ref_interval(d.r, d.re) != undefined
      );
    })
    .attr("d", dotplot_alignment_path_generator)
    .style("stroke-width", 2)
    .style("stroke", "black")
    .style("stroke-opacity", 1)
    .style("fill", "none")
    .on("mouseover", function (d) {
      var text = Math.abs(d.qe - d.qs) + " bp";
      var x =
        _positions.dotplot.canvas.x +
        _ribbon_scales.ref_interval_scale(
          map_ref_interval(d.r, (d.rs + d.re) / 2)
        );
      var y =
        _ribbon_padding.text * -3 +
        _positions.dotplot.canvas.y +
        _ribbon_scales.read_scale((d.qs + d.qe) / 2);
      show_ribbon_tooltip(text, x, y, _ribbon_svg1);
    })
    .on("mouseout", function (d) {
      _ribbon_svg1.selectAll("g.tip").remove();
    });

  var read_axis = d3.axisLeft()
    .scale(_ribbon_scales.read_scale)
    .ticks(5)
    .tickSize(5, 0, 0)
    .tickFormat(d3.format("s"));
  var read_axis_label = _ribbon_svg1
    .append("g")
    .attr("class", "axis")
    .attr(
      "transform",
      "translate(" +
        _positions.dotplot.canvas.x +
        "," +
        _positions.dotplot.canvas.y +
        ")"
    )
    .style("font-size", _positions.fontsize)
    .call(read_axis);
  read_axis_label.selectAll("text").style("font-size", _positions.fontsize);

  if (
    _Additional_ref_intervals.length > 0 &&
    _ribbon_settings.draw_focus_rectangle == true
  ) {
    canvas
      .selectAll("rect.focal_regions")
      .data(_Additional_ref_intervals)
      .enter()
      .append("rect")
      .attr("class", "focal_regions")
      .attr("x", function (d) {
        return _ribbon_scales.ref_interval_scale(
          map_ref_interval(d.chrom, d.start)
        );
      })
      .attr("y", _positions.read.top)
      .attr("width", function (d) {
        return (
          _ribbon_scales.ref_interval_scale(map_ref_interval(d.chrom, d.end)) -
          _ribbon_scales.ref_interval_scale(map_ref_interval(d.chrom, d.start))
        );
      })
      .attr("height", _positions.read.bottom - _positions.read.top)
      .attr("fill", "none")
      .style("stroke-width", 4)
      .style("stroke", "#333333");
  }
}

function adjust_singleread_layout() {
  _positions.singleread.top_bar = {
    y:
      _layout.svg_height *
      _ribbon_static.singleread_layout_fractions.ref_and_mapping,
    height:
      _layout.svg_height * _ribbon_static.singleread_layout_fractions.top_bar,
  };

  var total_header = _ribbon_static.singleread_layout_fractions.ref_and_mapping;

  if (
    _Features_for_ribbon.length > 0 ||
    _Variants.length > 0 ||
    _Bedpe.length > 0
  ) {
    total_header += _ribbon_static.singleread_layout_fractions.top_bar;
  }

  if (_Features_for_ribbon.length > 0) {
    _positions.singleread.features = {
      arrow_size:
        (_layout.svg2_height *
          _ribbon_static.singleread_layout_fractions["features"]) /
        7,
    };
    _positions.singleread.features.y = _layout.svg_height * total_header;
    total_header += _ribbon_static.singleread_layout_fractions.features;
    _positions.singleread.features.rect_height =
      _layout.svg_height * _ribbon_static.singleread_layout_fractions.features;
  }

  if (_Variants.length > 0 || _Bedpe.length > 0) {
    _positions.singleread.variants = {};
    _positions.singleread.variants.y = _layout.svg_height * total_header;
    total_header += _ribbon_static.singleread_layout_fractions.variants;
    _positions.singleread.variants.height =
      _layout.svg_height * _ribbon_static.singleread_layout_fractions.variants;
  }

  _positions.singleread.ref_block = {
    y: _layout.svg_height * 0.15,
    x: _positions.multiread.ref_intervals.x,
    width: _positions.multiread.ref_intervals.width,
    height: _layout.svg_height * 0.03,
  };
  _positions.singleread.ref_intervals = {
    x: _positions.singleread.ref_block.x,
    width: _positions.singleread.ref_block.width,
  };

  _positions.singleread.bottom_bar = {
    y: _layout.svg_height * total_header,
    height:
      _layout.svg_height *
      _ribbon_static.singleread_layout_fractions.bottom_bar,
  };
}

function draw_singleread_header() {
  adjust_singleread_layout();

  // Draw "Reference" label
  _ribbon_svg1
    .append("text")
    .attr("id", "ref_tag")
    .text("Reference")
    .attr(
      "x",
      _positions.singleread.ref_block.x +
        _positions.singleread.ref_block.width / 2
    )
    .attr(
      "y",
      _positions.singleread.ref_block.y -
        _positions.singleread.ref_block.height * 3
    )
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .style("font-size", _positions.fontsize);

  _ribbon_scales.whole_ref_scale.range([
    _positions.singleread.ref_block.x,
    _positions.singleread.ref_block.x + _positions.singleread.ref_block.width,
  ]);
  _ribbon_scales.ref_interval_scale.range([
    _positions.singleread.ref_intervals.x,
    _positions.singleread.ref_intervals.x +
      _positions.singleread.ref_intervals.width,
  ]);

  // Whole reference chromosomes for the relevant references:
  _ribbon_svg1
    .selectAll("rect.ref_block")
    .data(_Whole_refs)
    .enter()
    .append("rect")
    .attr("class", "ref_block")
    .attr("x", function (d) {
      return _ribbon_scales.whole_ref_scale(d.cum_pos);
    })
    .attr("y", _positions.singleread.ref_block.y)
    .attr("width", function (d) {
      return (
        _ribbon_scales.whole_ref_scale(d.cum_pos + d.size) -
        _ribbon_scales.whole_ref_scale(d.cum_pos)
      );
    })
    .attr("height", _positions.singleread.ref_block.height)
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.chrom);
    })
    .style("stroke-width", 1)
    .style("stroke", "black")
    .on("click", function (d) {
      highlight_chromosome(d.chrom);
    })
    .on("mouseover", function (d) {
      var text = d.chrom + ": " + bp_format(d.size);
      var x = _ribbon_scales.whole_ref_scale(d.cum_pos + d.size / 2);
      var y = _positions.singleread.ref_block.y - _ribbon_padding.text;
      show_ribbon_tooltip(text, x, y, _ribbon_svg1);
    })
    .on("mouseout", function (d) {
      _ribbon_svg1.selectAll("g.tip").remove();
    });

  _ribbon_svg1
    .selectAll("text.ref_block")
    .data(_Whole_refs)
    .enter()
    .append("text")
    .attr("class", "ref_block")
    .filter(function (d) {
      return (
        _ribbon_scales.whole_ref_scale(d.cum_pos + d.size) -
          _ribbon_scales.whole_ref_scale(d.cum_pos) >
        (_positions.fontsize / 5) * d.chrom.length
      );
    })
    .text(function (d) {
      var chrom = d.chrom;
      return chrom.replace("chr", "");
    })
    .attr("x", function (d) {
      return _ribbon_scales.whole_ref_scale(d.cum_pos + d.size / 2);
    })
    .attr("y", _positions.singleread.ref_block.y - _ribbon_padding.text)
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "bottom")
    .style("font-size", _positions.fontsize);

  // Zoom into reference intervals where the read maps:
  _ribbon_svg1
    .selectAll("rect.top_bar")
    .data(_Ref_intervals)
    .enter()
    .append("rect")
    .attr("class", "top_bar")
    .filter(function (d) {
      return (
        _ribbon_settings.ref_match_chunk_ref_intervals == false ||
        (_Refs_show_or_hide[d.chrom] &&
          d.num_alignments >= _ribbon_settings.min_aligns_for_ref_interval)
      );
    })
    .attr("x", function (d) {
      return _ribbon_scales.ref_interval_scale(d.cum_pos);
    })
    .attr("y", _positions.singleread.top_bar.y)
    .attr("width", function (d) {
      return (
        _ribbon_scales.ref_interval_scale(d.end) -
        _ribbon_scales.ref_interval_scale(d.start)
      );
    })
    .attr(
      "height",
      _positions.singleread.bottom_bar.y - _positions.singleread.top_bar.y
    )
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.chrom);
    })
    .style("stroke-width", 1)
    .style("stroke", "black")
    .style("opacity", 0.5)
    .on("mouseover", function (d) {
      var text =
        d.chrom + ": " + comma_format(d.start) + " - " + comma_format(d.end);
      var x = _ribbon_scales.ref_interval_scale(
        d.cum_pos + (d.end - d.start) / 2
      );
      var y = _positions.singleread.top_bar.y - _ribbon_padding.text;
      show_ribbon_tooltip(text, x, y, _ribbon_svg1);
    })
    .on("mouseout", function (d) {
      _ribbon_svg1.selectAll("g.tip").remove();
    });

  _ribbon_svg1
    .selectAll("rect.bottom_bar")
    .data(_Ref_intervals)
    .enter()
    .append("rect")
    .attr("class", "bottom_bar")
    .filter(function (d) {
      return (
        _ribbon_settings.ref_match_chunk_ref_intervals == false ||
        (_Refs_show_or_hide[d.chrom] &&
          d.num_alignments >= _ribbon_settings.min_aligns_for_ref_interval)
      );
    })
    .attr("x", function (d) {
      return _ribbon_scales.ref_interval_scale(d.cum_pos);
    })
    .attr("y", _positions.singleread.bottom_bar.y)
    .attr("width", function (d) {
      return (
        _ribbon_scales.ref_interval_scale(d.end) -
        _ribbon_scales.ref_interval_scale(d.start)
      );
    })
    .attr("height", _positions.singleread.bottom_bar.height)
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.chrom);
    })
    .style("stroke-width", 1)
    .style("stroke", "black")
    .on("mouseover", function (d) {
      var text =
        d.chrom + ": " + comma_format(d.start) + " - " + comma_format(d.end);
      var x = _ribbon_scales.ref_interval_scale(
        d.cum_pos + (d.end - d.start) / 2
      );
      var y = _positions.singleread.bottom_bar.y - _ribbon_padding.text;
      show_ribbon_tooltip(text, x, y, _ribbon_svg1);
    })
    .on("mouseout", function (d) {
      _ribbon_svg1.selectAll("g.tip").remove();
    });

  _ribbon_svg1
    .selectAll("path.ref_mapping")
    .data(_Ref_intervals)
    .enter()
    .append("path")
    .attr("class", "ref_mapping")
    .filter(function (d) {
      return (
        map_whole_ref(d.chrom, d.start) != undefined &&
        (_ribbon_settings.ref_match_chunk_ref_intervals == false ||
          (_Refs_show_or_hide[d.chrom] &&
            d.num_alignments >= _ribbon_settings.min_aligns_for_ref_interval))
      );
    })
    .attr("d", function (d) {
      return ref_mapping_path_generator(d, false);
    })
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.chrom);
    });

  /////////////////////////   Variants   /////////////////////////////
  if (_Variants.length > 0) {
    var variants_in_view = find_features_in_view(
      _Variants,
      closest_map_ref_interval,
      _ribbon_scales.ref_interval_scale
    );
    var variants_to_show = [];
    for (var i in variants_in_view) {
      if (
        _ribbon_settings.show_only_selected_variants == false ||
        variants_in_view[i].highlight == true
      ) {
        variants_to_show.push(variants_in_view[i]);
      }
    }

    var max_overlaps = calculate_offsets_for_features_in_view(variants_to_show);

    _ribbon_svg1
      .selectAll("rect.variants")
      .data(variants_to_show)
      .enter()
      .append("rect")
      .attr("class", function (d) {
        if (d.highlight == true) {
          return "variants highlight";
        } else {
          return "variants";
        }
      })
      .attr("x", function (d) {
        return d.start_cum_pos;
      })
      .attr("width", function (d) {
        return d.end_cum_pos - d.start_cum_pos;
      })
      .attr("y", function (d) {
        return (
          _positions.singleread.variants.y +
          (_positions.singleread.variants.height * d.offset) / max_overlaps
        );
      })
      .attr(
        "height",
        (_positions.singleread.variants.height / max_overlaps) * 0.9
      )
      .style("fill", function (d) {
        return _ribbon_scales.variant_color_scale(d.type);
      })
      .on("mouseover", function (d) {
        var text = d.name;
        if (d.type != undefined) {
          text = d.name + " (" + d.type + ")";
        }
        var x = (d.start_cum_pos + d.end_cum_pos) / 2;
        var y =
          _positions.singleread.variants.y +
          _positions.singleread.ref_intervals.height / max_overlaps +
          _ribbon_padding.text;
        show_ribbon_tooltip(text, x, y, _ribbon_svg1);
      })
      .on("mouseout", function (d) {
        _ribbon_svg1.selectAll("g.tip").remove();
      });
  }

  if (_Features_for_ribbon.length > 0) {
    draw_singleread_features();
  }
  if (_Bedpe.length > 0) {
    var variants_in_view = [];
    for (var i in _Bedpe) {
      if (
        _ribbon_settings.show_only_selected_variants == false ||
        _Bedpe[i].highlight == true
      ) {
        var variant = _Bedpe[i];
        var results1 = closest_map_ref_interval(variant.chrom1, variant.pos1);
        var results2 = closest_map_ref_interval(variant.chrom2, variant.pos2);

        if (results1.precision == "exact" && results2.precision == "exact") {
          variant.cum_pos1 = _ribbon_scales.ref_interval_scale(results1.pos);
          variant.cum_pos2 = _ribbon_scales.ref_interval_scale(results2.pos);
          variants_in_view.push(variant);
        }
      }
    }

    var loop_path_generator = function (d) {
      var foot_length = _positions.multiread.variants.foot_length;

      var bottom_y =
        _positions.singleread.variants.y +
        _positions.singleread.variants.height * 0.9;
      var highest_point = _positions.singleread.variants.height * 0.7;
      var x1 = d.cum_pos1,
        y_ankle = bottom_y - highest_point / 2,
        x2 = d.cum_pos2,
        y_foot = bottom_y;

      var arrow = -1 * _positions.multiread.variants.arrow_size;

      var xmid = (x1 + x2) / 2;
      var ymid = bottom_y - highest_point * 2; // bezier curve pointing toward 2*highest_point ends up around highest_point at the top of the curve

      var direction1 = Number(d.strand1 == "-") * 2 - 1, // negative strands means the read is mappping to the right of the breakpoint
        direction2 = Number(d.strand2 == "-") * 2 - 1;

      if (isNaN(xmid) == true) {
        console.warn("xmid is not a number in object:", d);
      }
      if (isNaN(direction1) == true) {
        console.warn("direction1 is not a number in object:", d);
      }

      return (
        "M " +
        (x1 + foot_length * direction1) +
        " " +
        y_foot + // toe
        " L " +
        (x1 + foot_length * direction1 + arrow * direction1) +
        " " +
        (y_foot + arrow) + // arrow
        " L " +
        (x1 + foot_length * direction1) +
        " " +
        y_foot + // toe
        " L " +
        (x1 + foot_length * direction1 + arrow * direction1) +
        " " +
        (y_foot - arrow) + // arrow
        " L " +
        (x1 + foot_length * direction1) +
        " " +
        y_foot + // toe
        " L " +
        x1 +
        " " +
        y_foot + // breakpoint
        // + " L " + x1                          + " " + y_top // up
        " L " +
        x1 +
        " " +
        y_ankle + // ankle
        " S " +
        xmid +
        " " +
        ymid +
        " " +
        x2 +
        " " +
        y_ankle + // curve to breakpoint
        // + " L " + x2                          + " " + y_top // up
        " L " +
        x2 +
        " " +
        y_foot + // breakpoint
        " L " +
        (x2 + foot_length * direction2) +
        " " +
        y_foot + // toe
        " L " +
        (x2 + foot_length * direction2 + arrow * direction2) +
        " " +
        (y_foot + arrow) + // arrow
        " L " +
        (x2 + foot_length * direction2) +
        " " +
        y_foot + // toe
        " L " +
        (x2 + foot_length * direction2 + arrow * direction2) +
        " " +
        (y_foot - arrow) + // arrow
        " L " +
        (x2 + foot_length * direction2) +
        " " +
        y_foot
      ); // toe
    };

    _ribbon_svg1
      .selectAll("path.bedpe_variants")
      .data(variants_in_view)
      .enter()
      .append("path")
      .attr("class", function (d) {
        if (d.highlight == true) {
          return "bedpe_variants highlight";
        } else {
          return "bedpe_variants";
        }
      })
      .attr("d", loop_path_generator)
      .style("stroke", "black")
      .on("mouseover", function (d) {
        var text = d.name;
        if (d.type != undefined) {
          text = d.name + " (" + d.type + ")";
        }
        var x = (d.cum_pos1 + d.cum_pos2) / 2;
        var y = _positions.singleread.variants.y - _ribbon_padding.text;
        show_ribbon_tooltip(text, x, y, _ribbon_svg1);
      })
      .on("mouseout", function (d) {
        _ribbon_svg1.selectAll("g.tip").remove();
      });
  }
}

function draw_singleread_features() {
  var features_in_view = find_features_in_view(
    _Features_for_ribbon,
    closest_map_ref_interval,
    _ribbon_scales.ref_interval_scale
  );
  var max_overlaps = calculate_offsets_for_features_in_view(features_in_view);
  if (_ribbon_settings.show_features_as == "rectangles") {
    _ribbon_svg1
      .selectAll("rect.features")
      .data(features_in_view)
      .enter()
      .append("rect")
      .attr("class", function (d) {
        if (d.highlight == true) {
          return "variants highlight";
        } else {
          return "variants";
        }
      })
      .attr("x", function (d) {
        return d.start_cum_pos;
      })
      .attr("width", function (d) {
        return d.end_cum_pos - d.start_cum_pos;
      })
      .attr("y", function (d) {
        return (
          _positions.singleread.features.y +
          (_positions.singleread.features.rect_height * d.offset) / max_overlaps
        );
      })
      .attr(
        "height",
        (_positions.singleread.features.rect_height * 0.9) / max_overlaps
      )
      .style("fill", function (d) {
        return _ribbon_scales.feature_color_scale(d.type);
      })
      .on("mouseover", function (d) {
        var text = d.name;
        if (d.type != undefined) {
          text = d.name + " (" + d.type + ")";
        }
        var x = (d.start_cum_pos + d.end_cum_pos) / 2;
        var y =
          _positions.singleread.features.y +
          (_positions.singleread.features.rect_height * d.offset) /
            max_overlaps -
          _ribbon_padding.text;
        show_ribbon_tooltip(text, x, y, _ribbon_svg1);
      })
      .on("mouseout", function (d) {
        _ribbon_svg1.selectAll("g.tip").remove();
      });
  } else if (
    _ribbon_settings.show_features_as == "arrows" ||
    _ribbon_settings.show_features_as == "names"
  ) {
    var feature_path_generator = function (d) {
      var arrow = -1 * _positions.singleread.features.arrow_size,
        x1 = d.start_cum_pos,
        x2 = d.end_cum_pos,
        y =
          _positions.singleread.features.y +
          (_positions.singleread.features.rect_height * d.offset) /
            max_overlaps,
        direction = Number(d.strand == "+") * 2 - 1;
      var xmid = (x1 + x2) / 2;

      return (
        "M " +
        x1 +
        " " +
        y +
        " L " +
        xmid +
        " " +
        y +
        " L " +
        (xmid + arrow * direction) +
        " " +
        (y + arrow) +
        " L " +
        xmid +
        " " +
        y +
        " L " +
        (xmid + arrow * direction) +
        " " +
        (y - arrow) +
        " L " +
        xmid +
        " " +
        y +
        " L " +
        x2 +
        " " +
        y
      );
    };

    _ribbon_svg1
      .selectAll("path.features")
      .data(features_in_view)
      .enter()
      .append("path")
      .attr("class", function (d) {
        if (d.highlight == true) {
          return "features highlight";
        } else {
          return "features";
        }
      })
      .attr("d", feature_path_generator)
      .style("stroke", function (d) {
        return _ribbon_scales.feature_color_scale(d.type);
      })
      .on("mouseover", function (d) {
        var text = d.name;
        if (d.type != undefined) {
          text = d.name + " (" + d.type + ")";
        }
        var x = (d.start_cum_pos + d.end_cum_pos) / 2;
        var y =
          _positions.singleread.features.y +
          (_positions.singleread.features.rect_height * d.offset) /
            max_overlaps -
          _ribbon_padding.text;
        show_ribbon_tooltip(text, x, y, _ribbon_svg1);
      })
      .on("mouseout", function (d) {
        _ribbon_svg1.selectAll("g.tip").remove();
      });

    if (_ribbon_settings.show_features_as == "names") {
      var text_boxes = _ribbon_svg1
        .selectAll("g.features")
        .data(features_in_view)
        .enter()
        .append("g")
        .attr("class", "features")
        .attr("transform", function (d) {
          return (
            "translate(" +
            (d.start_cum_pos + d.end_cum_pos) / 2 +
            "," +
            (_positions.singleread.features.y +
              (_positions.singleread.features.rect_height * d.offset) /
                max_overlaps -
              _ribbon_padding.text) +
            ")"
          );
        });

      var height =
        (_positions.singleread.features.rect_height / (max_overlaps + 3)) * 2;

      text_boxes
        .append("text")
        .attr("class", function (d) {
          if (d.highlight == true) {
            return "features highlight";
          } else {
            return "features";
          }
        })
        .attr("x", 0)
        .attr("y", 0)
        .attr("fill", function (d) {
          return _ribbon_scales.feature_color_scale(d.type);
        })
        .style("font-size", height)
        .style("text-anchor", "middle")
        .attr("dominant-baseline", "ideographic")
        .text(function (d) {
          return d.name;
        });
    }
  }
}

function draw_ribbons() {
  reset_svg();

  if (_Alignments == undefined) {
    return;
  }
  draw_singleread_header();

  // Calculate layouts within the svg
  _positions.read = {
    y: _layout.svg_height * 0.85,
    x: _positions.multiread.ref_intervals.x,
    width: _positions.multiread.ref_intervals.width,
    height: _layout.svg_height * 0.03,
  };

  // Alignments
  var flip = false;

  if (_ribbon_settings.orient_reads_by == "primary") {
    var primary_alignment =
      _Chunk_alignments[_current_read_index].alignments[
        _Chunk_alignments[_current_read_index].index_primary
      ];
    flip = primary_alignment.qe - primary_alignment.qs < 0;
  } else if (_ribbon_settings.orient_reads_by == "longest") {
    var longest_alignment =
      _Chunk_alignments[_current_read_index].alignments[
        _Chunk_alignments[_current_read_index].index_longest
      ];
    flip = longest_alignment.qe - longest_alignment.qs < 0;
  } else if (_ribbon_settings.orient_reads_by == "reverse") {
    flip = true;
  } else {
    flip = false;
  }

  if (flip == true) {
    _ribbon_scales.read_scale.range([
      _positions.read.x + _positions.read.width,
      _positions.read.x,
    ]);
  } else {
    _ribbon_scales.read_scale.range([
      _positions.read.x,
      _positions.read.x + _positions.read.width,
    ]);
  }

  // Draw read
  if (_ribbon_settings.paired_end_mode) {
    var read_bar = _ribbon_svg1.append("g").attr("class", "read");
    read_bar
      .on("mouseover", function () {
        var text =
          "read: " + _Alignments[_Alignments.length - 1].read_length + " bp";
        var x = _positions.read.x + _positions.read.width / 2;
        var y = _positions.read.y + _positions.read.height * 3.5;
        show_ribbon_tooltip(text, x, y, _ribbon_svg1);
      })
      .on("mouseout", function (d) {
        _ribbon_svg1.selectAll("g.tip").remove();
      });
    var first_read_start = _ribbon_scales.read_scale(0);
    var first_read_end = _ribbon_scales.read_scale(
      _Chunk_alignments[_current_read_index].read_lengths[0]
    );
    var second_read_start = _ribbon_scales.read_scale(
      _Chunk_alignments[_current_read_index].read_lengths[0] +
        _Chunk_alignments[_current_read_index].read_lengths[1]
    );
    var second_read_end = _ribbon_scales.read_scale(
      _Chunk_alignments[_current_read_index].read_lengths[0] +
        _Chunk_alignments[_current_read_index].read_lengths[1] +
        _Chunk_alignments[_current_read_index].read_lengths[2]
    );
    if (first_read_start > first_read_end) {
      var tmp = first_read_start;
      first_read_start = first_read_end;
      first_read_end = tmp;
      tmp = second_read_start;
      second_read_start = second_read_end;
      second_read_end = tmp;
    }

    read_bar
      .append("rect")
      .attr("x", first_read_start)
      .attr("y", _positions.read.y)
      .attr("width", first_read_end - first_read_start)
      .attr("height", _positions.read.height)
      .style("stroke-width", 1)
      .style("stroke", "black")
      .attr("fill", "black");
    read_bar
      .append("rect")
      .attr("x", second_read_start)
      .attr("y", _positions.read.y)
      .attr("width", second_read_end - second_read_start)
      .attr("height", _positions.read.height)
      .style("stroke-width", 1)
      .style("stroke", "black")
      .attr("fill", "black");
  } else {
    _ribbon_svg1
      .append("rect")
      .attr("class", "read")
      .attr("x", _positions.read.x)
      .attr("y", _positions.read.y)
      .attr("width", _positions.read.width)
      .attr("height", _positions.read.height)
      .style("stroke-width", 1)
      .style("stroke", "black")
      .attr("fill", "black")
      .on("mouseover", function () {
        var text =
          "read: " + _Alignments[_Alignments.length - 1].read_length + " bp";
        var x = _positions.read.x + _positions.read.width / 2;
        var y = _positions.read.y + _positions.read.height * 3.5;
        show_ribbon_tooltip(text, x, y, _ribbon_svg1);
      })
      .on("mouseout", function (d) {
        _ribbon_svg1.selectAll("g.tip").remove();
      });
  }
  _ribbon_svg1
    .append("text")
    .text("Read / Query")
    .attr("x", _positions.read.x + _positions.read.width / 2)
    .attr("y", _layout.svg_height)
    .style("text-anchor", "middle")
    .attr("dominant-baseline", "ideographic")
    .style("font-size", _positions.fontsize);

  // Draw alignments
  _ribbon_svg1
    .selectAll("path.alignment")
    .data(_Alignments)
    .enter()
    .append("path")
    .filter(function (d) {
      return (
        d.mq >= _ribbon_settings.min_mapping_quality &&
        d.aligned_length >= _ribbon_settings.min_align_length
      );
    })
    .attr("class", "alignment")
    .attr("d", ribbon_alignment_path_generator)
    .style("stroke-width", function () {
      if (_ribbon_settings.ribbon_outline) {
        return 1;
      } else {
        return 0;
      }
    })
    .style("stroke", function (d) {
      return _ribbon_scales.ref_color_scale(d.r);
    })
    .style("stroke-opacity", 1)
    .attr("fill", function (d) {
      return _ribbon_scales.ref_color_scale(d.r);
    })
    .attr("fill-opacity", _ribbon_static.alignment_alpha)
    .on("mouseover", function (d) {
      var text = Math.abs(d.qe - d.qs) + " bp";
      var x = _ribbon_scales.read_scale((d.qs + d.qe) / 2);
      var y = _positions.read.y - _ribbon_padding.text;
      show_ribbon_tooltip(text, x, y, _ribbon_svg1);
    })
    .on("mouseout", function (d) {
      _ribbon_svg1.selectAll("g.tip").remove();
    });

  var read_axis = d3.axisBottom()
    .scale(_ribbon_scales.read_scale)
    .ticks(5)
    .tickSize(5, 0, 0)
    .tickFormat(d3.format("s"));
  var read_axis_label = _ribbon_svg1
    .append("g")
    .attr("class", "axis")
    .attr(
      "transform",
      "translate(" +
        0 +
        "," +
        (_positions.read.y + _positions.read.height) +
        ")"
    )
    .call(read_axis);
  read_axis_label.selectAll("text").style("font-size", _positions.fontsize);
}

// ===========================================================================
// == Examples
// ===========================================================================

// Cookie Management (documentation: https://www.w3schools.com/js/js_cookies.asp)
// ¯\_(ツ)_/¯
function get_cookie() {
  // document.cookie looks like "myvar1=myvalue1; myvar2=myvalue2; ..."
  var ribbon = document.cookie
    .split(";")
    .map((d) => d.trim().split("="))
    .filter((d) => d[0] == "ribbon");

  if (ribbon.length == 0 || ribbon[0].length < 2) return { links: [] };
  return JSON.parse(ribbon[0][1]);
}

function set_cookie(data) {
  var date = new Date();
  var expires = date.setTime(date.getTime() + 300 * 24 * 60 * 60 * 1000);
  document.cookie = `ribbon=${JSON.stringify(data)}; expires=${expires}`;
}

// Show user links saved in cookies
function add_user_links_to_navbar() {
  var data = get_cookie(),
    user_links = data.links;

  d3.select("#user_data_navbar_item").style(
    "visibility",
    user_links ? "hidden" : "visible"
  );
  if (!user_links) return;

  // Each user_link = { name: ..., perma: ..., date: ... }
  d3.select("ul#user_data_list").html("");
  $.each(user_links, function (k, v) {
    d3.select("ul#user_data_list")
      .append("li")
      .append("a")
      .attr("target", "_blank")
      .attr("href", `?perma=${v.perma}`)
      .html(
        `${v.name} &nbsp;&nbsp;&nbsp;<small><small>${moment(
          v.date
        ).fromNow()}</small></small>`
      );
  });
}

function variants_just_loaded() {
  refresh_visibility();
}

function set_alignment_info_text() {
  d3.select("#text_alignment_file_output").html(
    _ribbon_settings.alignment_info_text
  );
}

function set_variant_info_text() {
  d3.select("#text_variant_file_output").html(
    _ribbon_settings.variant_info_text
  );
}

export async function read_bam_urls(urls, in_background = false) {
  _Bams = [];
  for (let url of urls) {
    if (url.startsWith("s3://")) {
      url = url.replace("s3://", "https://42basepairs.com/download/s3/");
    } else if (url.startsWith("gs://")) {
      url = url.replace("gs://", "https://42basepairs.com/download/gs/");
    } else if (!url.startsWith("https://")) {
      user_message("Error", `BAM URL must be HTTPS, s3:// or gs:// paths, found "${url}"`);
      return;
    }

    let new_bam = new BamFile([url]);
    await new_bam.mount();
    await new_bam.parseHeader();
    _Bams.push(new_bam);
  }

  if (urls.length == 1) {
    _ribbon_settings.alignment_info_text = `Bam from url: ${urls[0]}`;
  } else {
  _ribbon_settings.alignment_info_text = `Bam(s) from url(s):<br>${urls.join("<br>")}`;
  }
  _ribbon_settings.bam_url = urls;
  if (!in_background) {
    set_alignment_info_text();
  }

  wait_then_run_when_bam_file_loaded();
}

function load_json_bam(header) {
  // Check match refs from region view checkbox by default
  _ribbon_settings.ref_match_chunk_ref_intervals = true;
  d3.select("#ref_match_region_view").property("checked", true);
  refresh_ui_for_new_dataset();
  reset_settings_for_new_dataset();

  clear_data();

  record_bam_header(header);

  organize_references_for_chunk();
  show_all_chromosomes();
  apply_ref_filters();

  reset_svg2();
  draw_chunk_ref();

  d3.select("#region_selector_panel").style("display", "block");
  d3.select("#variant_input_panel").style("display", "block");
  d3.select("#feature_input_panel").style("display", "block");
}

// Compress data before sending it
function generate_permalink_data(post_data) {
  return btoa(
    // 3/3: convert resulting binary to base 64 so we can send it to the server
    pako.deflate(
      // 2/3: compress string with zlib
      JSON.stringify(post_data), // 1/3: stringify object so we can compress it
      { to: "string" }
    )
  );
}

// Create new permalink
function write_permalink() {
  d3.select("#generate_permalink_button").html("Creating permalink...");
  d3.select("#generate_permalink_button").property("disabled", true);

  var permalink_name = get_name();

  var header = [];
  for (var i in _Whole_refs) {
    header.push({ name: _Whole_refs[i].chrom, end: _Whole_refs[i].size });
  }
  var post_data = {
    ribbon_perma: {
      header: header,
      alignments: _Chunk_alignments,
      variants: _Variants,
      bedpe: _Bedpe,
      features: _Features_for_ribbon,
      _Refs_show_or_hide: _Refs_show_or_hide,
      config: {
        focus_regions: _Additional_ref_intervals,
        selected_read: _current_read_index,
        settings: _ribbon_settings,
      },
      permalink_name: permalink_name,
    },
  };
  if (_Chunk_alignments.length > 800) {
    user_message_ribbon(
      "Warning",
      "A large dataset may fail to create a permalink. Reduce upload file size if this occurs."
    );
  }

  jQuery.ajax({
    type: "POST",
    url: URL_API_STORE,
    data: JSON.stringify({
      name: permalink_name,
      ribbon: generate_permalink_data(post_data),
    }),
    success: function (data) {
      let link = `<a href="?perma=${data.data}">${permalink_name}</a>`;
      let message = link + "<p>Permalinks recreate the current view with all the data and settings except that it only takes the current snapshot of a bam file instead of copying the whole thing.<p>";
      user_message_ribbon(
        "Success",
        message
      );
      d3.select("#generate_permalink_button").property("disabled", false);
      d3.select("#generate_permalink_button").html("Share permalink");

      var cookie = get_cookie();
      if (cookie.links == null) cookie.links = [];
      cookie.links.push({
        name: permalink_name,
        perma: data.data,
        date: moment().format(),
      });
      set_cookie(cookie);
      add_user_links_to_navbar();
    },
    error: function (e) {
      alert("Error:" + e.message);
      d3.select("#generate_permalink_button").property("disabled", false);
      d3.select("#generate_permalink_button").html("Share permalink");
    },
  });
}

// Read existing permalink
function read_permalink(id) {
  user_message_ribbon("Info", "Loading data from permalink");

  jQuery.ajax({
    url: URL_API_STORE + id,
    success: function (data) {
      // Decompress
      file_content = JSON.parse(
        // Decompress
        pako.inflate(
          // Convert base-64 encoding (needed for data transfer) to binary
          atob(data.data.ribbon),
          // Decompress to string
          { to: "string" }
        )
      );

      // Data type
      var json_data = null;
      if (typeof file_content === "object") {
        json_data = file_content;
      } else if (typeof file_content === "string") {
        var file_content = file_content
          .replace(/\n/g, "\\n")
          .replace(/\t/g, "\\t");
        json_data = JSON.parse(file_content);
      } else {
        console.error(
          "Cannot read permalink, returned type is not object or string"
        );
      }

      // Alignments
      if (json_data["ribbon_perma"] != undefined) {
        if (
          json_data["ribbon_perma"]["config"]["settings"]["bam_url"] !=
          undefined
        ) {
          read_bam_urls(
            json_data["ribbon_perma"]["config"]["settings"]["bam_url"],
            true
          );
        }
        if (json_data["ribbon_perma"]["config"]["focus_regions"] != undefined) {
          _Additional_ref_intervals =
            json_data["ribbon_perma"]["config"]["focus_regions"];
        }
        if (json_data["ribbon_perma"]["header"] != undefined) {
          load_json_bam(json_data["ribbon_perma"]["header"]);
        }
        if (json_data["ribbon_perma"]["alignments"] != undefined) {
          _Chunk_alignments = json_data["ribbon_perma"]["alignments"];
          chunk_changed();
          tell_user_how_many_records_loaded();
        }
        if (json_data["ribbon_perma"]["_Refs_show_or_hide"] != undefined) {
          _Refs_show_or_hide = json_data["ribbon_perma"]["_Refs_show_or_hide"];
        }
        if (
          json_data["ribbon_perma"]["variants"] != undefined &&
          json_data["ribbon_perma"]["variants"].length > 0
        ) {
          _Variants = json_data["ribbon_perma"]["variants"];
          update_variants();
        }
        if (
          json_data["ribbon_perma"]["features"] != undefined &&
          json_data["ribbon_perma"]["features"].length > 0
        ) {
          _Features_for_ribbon = json_data["ribbon_perma"]["features"];
          update_features();
        }
        if (
          json_data["ribbon_perma"]["bedpe"] != undefined &&
          json_data["ribbon_perma"]["bedpe"].length > 0
        ) {
          _Bedpe = json_data["ribbon_perma"]["bedpe"];
          update_bedpe();
        }
        if (json_data["ribbon_perma"]["config"]["selected_read"] != undefined) {
          new_read_selected(
            json_data["ribbon_perma"]["config"]["selected_read"]
          );
        }

        if (json_data["ribbon_perma"]["config"]["settings"] != undefined) {
          _ribbon_settings = json_data["ribbon_perma"]["config"]["settings"];
          // For backwards compatibility:
          if (_ribbon_settings.color_index == undefined) {
            _ribbon_settings.color_index = 0;
          }
          if (_ribbon_settings.feature_types_to_show == undefined) {
            _ribbon_settings.feature_types_to_show = { protein_coding: true };
          }
          refresh_ui_for_new_dataset();
          _ribbon_scales.ref_color_scale.range(
            _ribbon_static.color_collections[_ribbon_settings.color_index]
          );
          apply_ref_filters();
          draw_region_view();
          refresh_visibility();
          refresh_ui_elements();
          set_alignment_info_text();
          set_variant_info_text();
          select_read();
          d3.select("#text_region_output").html("Showing permalink: " + id);
        }
        if (json_data["ribbon_perma"]["permalink_name"] != undefined) {
          d3.select("#notes").property(
            "value",
            json_data["ribbon_perma"]["permalink_name"]
          );
        }
      } else {
        if (json_data["bam"] != undefined) {
          if (json_data["bam"]["header"]["sq"] != undefined) {
            // header must be [{name: , end: }, {name: , end: }]
            _ribbon_settings.current_input_type = "bam";
            load_json_bam(json_data["bam"]["header"]["sq"]);
          } else {
            user_message_ribbon(
              "JSON object has bam, but bam does not contain key: header.sq"
            );
          }
          if (json_data["bam"]["records"] != undefined) {
            use_fetched_data(json_data["bam"]["records"]);
          } else {
            user_message_ribbon(
              "JSON object has bam, but bam does not contain key: records"
            );
          }
        } else if (json_data["bam_url"] != undefined) {
          read_bam_urls(json_data["bam_url"]);
        }

        if (json_data["bedpe"] != undefined) {
          bedpe_input_changed(json_data["bedpe"]);
        }

        if (json_data["vcf"] != undefined) {
          vcf_input_changed(json_data["vcf"]);
        }
      }
    },
    error: function (e) {
      user_message_ribbon("Error", "Permalink not found on server");
    },
  });
}

add_user_links_to_navbar();

async function open_variant_file() {
  if (this.files[0].size > LARGE_FILE_THRESHOLD) {
    user_message_ribbon("Warning", "Loading large file may take a while.");
  }

  var file_extension = /[^.]+$/.exec(this.files[0].name)[0];
  if (file_extension == "vcf") {
    const raw_data = await this.files[0].text();
    vcf_input_changed(raw_data);
    variants_just_loaded();
    _ribbon_settings.variant_info_text =
      "Variants from file: " + this.files[0].name;
    set_variant_info_text();
  } else {
    user_message_ribbon("Error", "File extension must be .vcf");
  }
}

function read_feature_bed(raw_data) {
  var input_text = raw_data.split("\n");

  _Features_for_ribbon = [];
  for (var i in input_text) {
    if (input_text[i][0] == "#") {
      continue;
    }
    var columns = input_text[i].split(/\s+/);
    if (columns.length > 2) {
      var start = parseInt(columns[1]);
      var end = parseInt(columns[2]);
      var score = parseFloat(columns[4]);
      if (isNaN(score)) {
        score = 0;
      }
      if (isNaN(start) || isNaN(end)) {
        user_message_ribbon(
          "Error",
          "Bed file must contain numbers in columns 2 and 3. Found: <pre>" +
            columns[1] +
            " and " +
            columns[2] +
            "</pre>."
        );
        return;
      }
      _Features_for_ribbon.push({
        chrom: columns[0],
        start: start,
        end: end,
        size: end - start,
        name: columns[3] || "",
        score: score,
        strand: columns[5],
        type: columns[6] || "",
      });
    }
  }

  update_features();
  draw_region_view();
  draw();
  refresh_ui_elements();

  make_feature_type_table();
}

async function open_feature_bed_file() {
  if (this.files[0].size > LARGE_FILE_THRESHOLD) {
    user_message_ribbon("Warning", "Loading large file may take a while.");
  }

  var file_extension = /[^.]+$/.exec(this.files[0].name)[0];
  if (file_extension == "bed") {
    const raw_data = await this.files[0].text();
    read_feature_bed(raw_data);
  } else {
    user_message_ribbon("Error", "File extension must be .bed");
  }
}

d3.select("#variant_file").on("change", open_variant_file);
d3.select("#ribbon_feature_bed_file").on("change", open_feature_bed_file);

// ===========================================================================
// == Load coords file
// ===========================================================================

async function open_coords_file() {
  if (this.files[0].size > LARGE_FILE_THRESHOLD) {
    user_message_ribbon("Info", "Loading large file may take a little while.");
  }

  const raw_data = await this.files[0].text();
  coords_input_changed(raw_data);
  _ribbon_settings.alignment_info_text =
    "Coords from file: " + this.files[0].name;
  set_alignment_info_text();
}

d3.select("#coords_file").on("change", open_coords_file);

// ===========================================================================
// == Load bam file
// ===========================================================================

function open_bam_file(event) {
  create_bam(event.target.files);
}

document
  .getElementById("bam_file")
  .addEventListener("change", open_bam_file, false);

async function create_bam(files) {
  let indexFile = null;
  let bamFile = null;
  for (var file of files) {
    var ext = file.name.substr(file.name.lastIndexOf(".") + 1);
    if (ext == "bam") bamFile = file;
    else if (["bai", "csi"].includes(ext)) indexFile = file;
  }

  if (files.length != 2 || bamFile == null || indexFile == null) {
    alert("Please select both a .bam file and an index file (.bai or .csi)");
    return;
  }

  _ribbon_settings.alignment_info_text = "Bam from file: " + bamFile.name;
  set_alignment_info_text();

  // Initialize bam file
  wait_then_run_when_bam_file_loaded();

  _Bams = [];
  let new_bam = new BamFile([bamFile, indexFile]);
  await new_bam.mount();
  await new_bam.parseHeader();
  _Bams.push(new_bam);
}

function wait_then_run_when_bam_file_loaded(counter) {
  if (typeof counter == "undefined") {
    counter = 0;
  } else if (counter > 30) {
    user_message_ribbon("Error", "File taking too long to load");
    return;
  }
  
  if (_Bams !== undefined) {
    let all_ready = _Bams.every((b) => b.ready);
    if (all_ready) {
      bam_loaded();
    }
  } else {
    window.setTimeout(function () {
      wait_then_run_when_bam_file_loaded(counter + 1);
    }, 300);
  }
}

function bam_loaded() {
  _ribbon_settings.current_input_type = "bam";

  // Check match refs from region view checkbox by default
  _ribbon_settings.ref_match_chunk_ref_intervals = true;
  d3.select("#ref_match_region_view").property("checked", true);
  refresh_ui_for_new_dataset();
  reset_settings_for_new_dataset();
  clear_data();
  record_bam_header(_Bams[0].header.sq); // This uses first bam file only.
  organize_references_for_chunk();
  show_all_chromosomes();
  apply_ref_filters();
  reset_svg2();
  draw_chunk_ref();

  d3.select("#region_selector_panel").style("display", "block");
  d3.select("#variant_input_panel").style("display", "block");
  d3.select("#feature_input_panel").style("display", "block");

  refresh_visibility();
  _ui_done_loading_bam = true;
}

function record_bam_header(sq_list) {
  // sq_list = [{name:  , end:}];

  _Ref_sizes_from_header = {};
  for (var i in sq_list) {
    _Ref_sizes_from_header[sq_list[i].name] = sq_list[i].end;
  }

  var chromosomes = [];
  for (var chrom in _Ref_sizes_from_header) {
    if (chromosomes.indexOf(chrom) == -1) {
      chromosomes.push(chrom);
    }
  }
  chromosomes.sort(natural_sort);

  _Whole_refs = [];
  var cumulative_whole_ref_size = 0;
  for (var j = 0; j < chromosomes.length; j++) {
    var chrom = chromosomes[j];
    if (isNaN(_Ref_sizes_from_header[chrom])) {
      console.warn(
        "Skipping chromosome: " +
          chrom +
          " because its size is not a number (from bam header)."
      );
    } else {
      _Whole_refs.push({
        chrom: chrom,
        size: _Ref_sizes_from_header[chrom],
        cum_pos: cumulative_whole_ref_size,
      });
      cumulative_whole_ref_size += _Ref_sizes_from_header[chrom];
    }
  }

  _ribbon_scales.whole_ref_scale.domain([0, cumulative_whole_ref_size]);
  _ribbon_scales.ref_color_scale.domain(chromosomes);
}

function remove_bam_file() {
  // For when sam input changes, clear bam file to prevent confusion and enable switching back to the bam file
  d3.select("#bam_file").property("value", "");
  d3.select("#region_selector_panel").style("display", "none");
}

// ===========================================================================
// == Select region
// ===========================================================================

function get_chrom_index(chrom) {
  for (var i = 0; i < _Whole_refs.length; i++) {
    if (
      _Whole_refs[i].chrom == chrom ||
      _Whole_refs[i].chrom == "chr" + chrom
    ) {
      return i;
    }
  }
  return undefined;
}

var _loading_bam_right_now = false;
function show_waiting_for_bam() {
  d3.select("#region_go").property("disabled", true);
  d3.select("#region_go").html("Fetching...");
  d3.select("#region_go").style("color", "gray");
  d3.selectAll(".fetch_table_button").html("...");
  _loading_bam_right_now = true;

  _ribbon_svg2
    .select("#no_alignments_message")
    .attr("fill", "blue")
    .text("Fetching from bam file...");
}

function show_bam_is_ready() {
  d3.select("#region_go").property("disabled", false);
  d3.select("#region_go").html("Go");
  d3.select("#region_go").style("color", "black");
  d3.selectAll(".fetch_table_button").html("go to variant");
  _loading_bam_right_now = false;
}

var _Bam_records_from_multiregions = [];
var _num_loaded_regions = 0;
var _num_bam_records_to_load = 0;

async function my_fetch(chrom, start, end, callback) {
  _num_bam_records_to_load += 1;
  // _Bam.fetch(chrom, start, end).then(callback);
  let all_bam_records = [];
  for (let i = 0; i < _Bams.length; i++) {
    let bam = _Bams[i];
    let records = await bam.fetch(chrom, start, end);
    records.forEach((record) => {record.bam = i;});
    all_bam_records.push(records);
  }

  Promise.all(all_bam_records).then((records) => {
    callback(records.flat());
  });
}

function check_if_all_bam_records_loaded() {
  if (_num_loaded_regions >= _num_bam_records_to_load) {
    // All bam records loaded, now consolidate to prevent duplicate reads:
    show_bam_is_ready();
    use_fetched_data(_Bam_records_from_multiregions);
    _Bam_records_from_multiregions = [];
  }
}

function use_additional_fetched_data(records) {
  _Bam_records_from_multiregions =
    _Bam_records_from_multiregions.concat(records);
  _num_loaded_regions++;
  check_if_all_bam_records_loaded();
}

//////////////////////////////    Fetch bam data from a specific region  //////////////////////////////

function parse_bam_record(record) {
  var chrom = record.segment;
  var rstart = record.pos;
  var flag = record.flag;
  var mq = record.mq;
  var raw_cigar = record.cigar;

  if (raw_cigar == "*" || raw_cigar == "") {
    return undefined;
  }

  if (mq == undefined) {
    console.warn("record missing mq:", record);
  }

  var strand = "+";
  if ((flag & 16) == 16) {
    strand = "-";
  }

  var alignments = [];

  if (record.SA != undefined && record.SA != "") {
    alignments = parse_SA_field(record.SA);
  }
  alignments.push(read_cigar(raw_cigar, chrom, rstart, strand, mq));

  var read_length = alignments[alignments.length - 1].read_length;

  for (var i = 0; i < alignments.length; i++) {
    if (alignments[i].read_length != read_length) {
      user_message_ribbon(
        "Warning",
        "read length of primary and supplementary alignments do not match for this read (calculated using cigar strings)"
      );
    }
  }

  return {
    alignments: alignments,
    raw: record,
    raw_type: "bam",
    readname: record.readName,
    flag: record.flag,
  };
}

function use_fetched_data(records) {
  show_bam_is_ready();

  var parsed_bam_records = [];
  for (var i in records) {
    var parsed = parse_bam_record(records[i]);
    if (parsed != undefined) {
      parsed_bam_records.push(parsed);
    }
  }

  _Chunk_alignments = pair_up_any_paired_reads(parsed_bam_records);
  parsed_bam_records = []; // reset to save memory

  chunk_changed();
  tell_user_how_many_records_loaded();
}

function tell_user_how_many_records_loaded() {
  if (_Chunk_alignments.length == 0) {
    _ribbon_svg2
      .select("#no_alignments_message")
      .attr("fill", "red")
      .text("No reads in the bam file at this location");
  } else {
    _ribbon_svg2
      .select("#no_alignments_message")
      .attr("fill", "white")
      .text("");
  }
}

function parse_locus(locus_string) {
  var locus = locus_string.split(":");
  var chrom = locus[0];
  var start_end = locus[1].split("-");
  var start = parseInt(start_end[0].replace(/,/g, ""));
  var end = start + 1;

  if (start_end.length == 2) {
    var end = parseInt(start_end[1].replace(/,/g, ""));
  }
  
  return { chrom: chrom, start: start, end: end };
}

function go_to_locus(locus_string) {
  let locus = parse_locus(locus_string);

  d3.select("#text_region_output").html(`Showing reads at position: ${locus_string}`);
  flexible_bam_fetch([locus]);
}

d3.select("#locus_input").on("keyup", function () {
  if (d3.event.keyCode == 13 && !_loading_bam_right_now) {
    region_submitted();
  }
});

function region_submitted(event) {
  var locus_input_text = d3.select("#locus_input").property("value");
  go_to_locus(locus_input_text);
}

d3.select("#region_go").on("click", region_submitted);
d3.select("#region_chrom").on("keyup", function () {
  if (d3.event.keyCode == 13 && !_loading_bam_right_now) {
    region_submitted();
  }
});
d3.select("#region_start").on("keyup", function () {
  if (d3.event.keyCode == 13 && !_loading_bam_right_now) {
    region_submitted();
  }
});

function submit_bam_url() {
  var url_input = d3.select("#bam_url_input").property("value");
  // Parse by comma-separated
  var urls = url_input.split(",").map((d) => d.trim());
  read_bam_urls(urls);
}
d3.select("#submit_bam_url").on("click", submit_bam_url);

// https://42basepairs.com/download/s3/giab/data_somatic/HG008/Liss_lab/PacBio_Revio_20240125/HG008-T_PacBio-HiFi-Revio_20240125_116x_CHM13v2.0.bam, https://42basepairs.com/download/s3/giab/data_somatic/HG008/Liss_lab/PacBio_Revio_20240125/HG008-N-P_PacBio-HiFi-Revio_20240125_35x_CHM13v2.0.bam


const _bam_presets = [
  {
    urls: [
      "https://42basepairs.com/download/gs/deepvariant/pacbio-case-study-testdata/HG003.pfda_challenge.grch38.phased.bam",
    ],
    name: "HG003 PacBio phased",
    "42basepairs_url":
      "https://42basepairs.com/browse/gs/deepvariant/pacbio-case-study-testdata?file=HG003.pfda_challenge.grch38.phased.bam",
  },
  {
    urls: [
      "https://42basepairs.com/download/s3/giab/data_somatic/HG008/Liss_lab/PacBio_Revio_20240125/HG008-T_PacBio-HiFi-Revio_20240125_116x_CHM13v2.0.bam",
      "https://42basepairs.com/download/s3/giab/data_somatic/HG008/Liss_lab/PacBio_Revio_20240125/HG008-N-P_PacBio-HiFi-Revio_20240125_35x_CHM13v2.0.bam",
    ],
    name: "HG008 PacBio Tumor from GIAB",
    "42basepairs_url":
      "https://42basepairs.com/browse/s3/giab/data_somatic/HG008/Liss_lab/PacBio_Revio_20240125/HG008-T_PacBio-HiFi-Revio_20240125_116x_CHM13v2.0.bam",
  },
  {
    urls: [
      "https://42basepairs.com/download/r2/genomics-data/alignments_HG002.bam",
    ],
    name: "HG002 Illumina",
    "42basepairs_url":
      "https://42basepairs.com/browse/r2/genomics-data/alignments_HG002.bam",
  },
];

function make_bam_presets_list() {
  const bamPresetsContainer = document.getElementById("bam_presets");

  _bam_presets.forEach((preset) => {
    let listItem = document.createElement("li");
    let load_link = document.createElement("span");
    load_link.textContent = preset.name;
    load_link.style.cursor = "pointer";
    load_link.title = preset.urls.join(','); // Show URL on hover
    load_link.addEventListener("click", () => {
      read_bam_urls(preset.urls);
    });
    listItem.appendChild(load_link);
    let link_to_42basepairs = document.createElement("a");
    link_to_42basepairs.href = preset["42basepairs_url"];
    link_to_42basepairs.textContent = " (source on 42bp)";
    link_to_42basepairs.target = "_blank";
    listItem.appendChild(link_to_42basepairs);
    bamPresetsContainer.appendChild(listItem);
  });
}

make_bam_presets_list();

// ===========================================================================
// == Automation
// ===========================================================================

var _variant_automation_counter = -1;
var _prefix_for_automated_images = "Auto-Ribbon";
var _read_index_list = [];
var _index_within_read_index_list = 0;

var _chosen_variant = undefined;
var log_number_reads_found = [];

function run_automation() {
  _variant_automation_counter = -1;

  if (_Bams == undefined) {
    user_message_ribbon("Error", "No bam file loaded");
    return;
  }
  if (_Bedpe.length == 0) {
    user_message_ribbon("Error", "No bedpe file loaded");
    return;
  }

  load_next_variant();
}
d3.select("#automation_file_prefix").on("change", function () {
  _prefix_for_automated_images = this.value;
});

d3.select("#automation_max_reads_to_screenshot").on("change", function () {
  _ribbon_settings.automation_max_reads_to_screenshot = parseInt(this.value);
  if (isNaN(_ribbon_settings.automation_max_reads_to_screenshot)) {
    _ribbon_settings.automation_max_reads_to_screenshot = 0;
  }
});

$("#automation_pick_split_reads").change(function () {
  _ribbon_settings.automation_reads_split_near_variant_only = this.checked;
});

$("#automation_subsample").change(function () {
  _ribbon_settings.automation_subsample = this.checked;
});

$("#add_coordinates_to_figures").change(function () {
  _ribbon_settings.add_coordinates_to_figures = this.checked;
  draw_region_view();
});

$("#automation_download_info").change(function () {
  _ribbon_settings.automation_download_info = this.checked;
});

d3.select("#automation_margin_for_split").on("change", function () {
  _ribbon_settings.automation_margin_for_split = parseInt(this.value);
  if (isNaN(_ribbon_settings.automation_margin_for_split)) {
    _ribbon_settings.automation_margin_for_split = 0;
  }
});

$("#draw_focus_rectangle").change(function () {
  _ribbon_settings.draw_focus_rectangle = this.checked;
  draw_region_view();
});

function load_next_variant() {
  _variant_automation_counter += 1;
  if (_variant_automation_counter < _Bedpe.length) {
    _chosen_variant = _Bedpe[_variant_automation_counter];
    _ribbon_settings.selected_bedpe_text = _chosen_variant.raw;
    bedpe_row_click(_chosen_variant);
    d3.select("#permalink_name").property(
      "value",
      _prefix_for_automated_images +
        "_" +
        _Bedpe[_variant_automation_counter].name
    );
    wait_save_and_repeat(0);
  } else {
    user_message_ribbon("Success", "DONE with automation!");
  }
}

function load_next_read() {
  if (_index_within_read_index_list < _read_index_list.length) {
    new_read_selected(_read_index_list[_index_within_read_index_list]);

    window.setTimeout(function () {
      screenshot_bottom(
        "read-" +
          _Chunk_alignments[_read_index_list[_index_within_read_index_list]]
            .readname
      );
      window.setTimeout(function () {
        _index_within_read_index_list += 1;
        load_next_read();
      }, 1000);
    }, 1000);
  }
}

function annotate_reads_by_split_near_variant() {
  for (var i in _Chunk_alignments) {
    _Chunk_alignments[i].split_near_focus = false;

    var split_1 = false;
    var split_2 = false;
    for (var j in _Chunk_alignments[i].alignments) {
      if (
        _Chunk_alignments[i].alignments[j].r == _chosen_variant.chrom1 &&
        (Math.abs(
          _Chunk_alignments[i].alignments[j].rs - _chosen_variant.pos1
        ) < _ribbon_settings.automation_margin_for_split ||
          Math.abs(
            _Chunk_alignments[i].alignments[j].re - _chosen_variant.pos1
          ) < _ribbon_settings.automation_margin_for_split)
      ) {
        split_1 = true;
      } else if (
        _Chunk_alignments[i].alignments[j].r == _chosen_variant.chrom2 &&
        (Math.abs(
          _Chunk_alignments[i].alignments[j].rs - _chosen_variant.pos2
        ) < _ribbon_settings.automation_margin_for_split ||
          Math.abs(
            _Chunk_alignments[i].alignments[j].re - _chosen_variant.pos2
          ) < _ribbon_settings.automation_margin_for_split)
      ) {
        split_2 = true;
      }

      if (split_1 && split_2) {
        _Chunk_alignments[i].split_near_focus = true;
        break;
      }
    }
  }
}

function screenshot_individual_reads() {
  var _eligible_read_list = [];
  if (_ribbon_settings.automation_reads_split_near_variant_only == true) {
    annotate_reads_by_split_near_variant();
  }
  if (_ribbon_settings.automation_reads_split_near_variant_only == true) {
    for (var i = 0; i < _Chunk_alignments.length; i++) {
      if (_Chunk_alignments[i].split_near_focus == true) {
        _eligible_read_list.push(i);
      }
    }
  } else {
    _eligible_read_list = Array.from(Array(_Chunk_alignments.length).keys());
  }
  log_number_reads_found.push(_eligible_read_list.length);

  if (_ribbon_settings.automation_download_info == true) {
    create_and_download_info(_eligible_read_list.length);
  }

  _read_index_list = [];
  if (_eligible_read_list.length > 0) {
    var extra_tries = 0;
    while (
      _read_index_list.length <
      _ribbon_settings.automation_max_reads_to_screenshot
    ) {
      var tmp =
        _eligible_read_list[
          Math.floor(Math.random() * _eligible_read_list.length)
        ];
      if (_read_index_list.indexOf(tmp) == -1) {
        _read_index_list.push(tmp);
      } else {
        extra_tries += 1;
        if (extra_tries > 10) {
          break;
        }
      }
    }
  }

  _index_within_read_index_list = 0;
  load_next_read();
}

function create_and_download_info(num_split) {
  var all_info_for_download = [];
  all_info_for_download.push(d3.select("#text_region_output").html());
  all_info_for_download.push(_ribbon_settings.alignment_info_text);
  all_info_for_download.push(_ribbon_settings.variant_info_text);
  all_info_for_download.push(d3.select("#bam_fetch_info").html());
  all_info_for_download.push("BEDPE: " + _ribbon_settings.selected_bedpe_text);
  all_info_for_download.push("Number of split reads: " + num_split.toString());

  var filename = get_name() + "_info.txt";
  download(filename, all_info_for_download.join("\n"));
}

function wait_save_and_repeat(counter) {
  if (check_bam_done_fetching() == true) {
    // Wait long enough for all the visuals to render on the screen:
    window.setTimeout(screenshot_top(), 5000);

    // Take pictures of individual reads
    screenshot_individual_reads();

    // Wait long enough until pictures have been taken:
    window.setTimeout(load_next_variant, 5000 + _read_index_list.length * 2000);
  } else {
    window.setTimeout(function () {
      wait_save_and_repeat(counter + 1);
    }, 1000);
  }
}

d3.select("#run_automation_button").on("click", run_automation);

// ===========================================================================
// == Responsiveness
// ===========================================================================

// Resize SVG and sidebar when window size changes
window.onresize = resizeWindow;

function resizeWindow() {
  resize_ribbon_views();
}

export function go_to_ribbon_mode() {
  // Grab any shared data that SplitThreader may have deposited.
  if (window.global_variants) {
    _Bedpe = window.global_variants;
    update_bedpe();
    draw_region_view();
    refresh_ui_elements();
  }
}

async function waitForBams() {
  while (!_Bams || !_Bams.every((b) => b.ready) || _ui_done_loading_bam == false) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function go_to_locus_when_ready(locus) {
  await waitForBams();
  go_to_locus(locus);
  go_to_ribbon_mode(); // Grab any large variants from SplitThreader.
}

// Check URL for ?locus=chr1:100-200 and run go_to_locus(locus_string) on that locus string.
function check_url_for_locus() {
  let url = new URL(window.location.href);
  let locus = url.searchParams.get("locus");
  if (locus) {
    d3.select("#locus_input").property("value", locus);
    go_to_locus_when_ready(locus);
  }
}

d3.select("#jump_to_variant_in_ribbon").on("click", function () {
  bedpe_row_click(window.selected_variant_data);

  // Open Ribbon tab.
  d3.select("#ribbon_tab").classed("active", true);
  d3.select("#ribbon-app-container").classed("active", true);
  // Close SplitThreader tab.
  d3.select("#splitthreader_tab").classed("active", false);
  d3.select("#splitthreader-app-container").classed("active", false);
});

// ===========================================================================
// == Main
// ===========================================================================

run_ribbon();
check_url_for_permalink();
check_url_for_locus();

window.addEventListener("beforeunload", function (event) {
  if (_Bams && _Bams.length > 0) {
    // Check user wants to quit without saving changes, if they have a bam file loaded.
    event.preventDefault();
  }
});
