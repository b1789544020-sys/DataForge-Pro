/* DataForge Pro — Tool Registry
 * Each tool defines: id, category, icon, pro flag, option schema, sample data.
 * Names/descriptions/labels are resolved through the i18n system (DFP.t).
 */
window.DFP = window.DFP || {};

window.DFP.TOOLS = [
  /* ============ TABLE TOOLS ============ */
  {
    id: "csv-cleaner",
    cat: "table",
    icon: "🧹",
    pro: false,
    io: "text",
    sample: "Name, Email ,Age\n John Doe ,JOHN@MAIL.COM,25\njane , jane@mail.com ,30\n John Doe ,JOHN@MAIL.COM,25\n\n ,,\nBob,not-an-email,40",
    options: [
      { key: "hasHeader", type: "checkbox", default: true },
      { key: "trim", type: "checkbox", default: true },
      { key: "normalizeWhitespace", type: "checkbox", default: false },
      { key: "stripQuotes", type: "checkbox", default: false },
      { key: "stripHTML", type: "checkbox", default: false },
      { key: "dropEmptyRows", type: "checkbox", default: true },
      { key: "removeEmptyCols", type: "checkbox", default: false },
      { key: "dedup", type: "checkbox", default: true },
      { key: "dedupColumn", type: "text", default: "" },
      { key: "fillEmpty", type: "text", default: "" },
      {
        key: "caseMode", type: "select", default: "none",
        opts: ["none", "upper", "lower"]
      },
      {
        key: "dateFormat", type: "select", default: "none",
        opts: ["none", "ymd", "dmy"]
      },
      {
        key: "validateEmail", type: "select", default: "off",
        opts: ["off", "mark", "remove"]
      },
    ],
  },
  {
    id: "column-extractor",
    cat: "table",
    icon: "📊",
    pro: false,
    io: "text",
    sample: "id,name,email,age,city\n1,Alice,alice@x.com,30,NYC\n2,Bob,bob@x.com,25,LA\n3,Carol,carol@x.com,35,SF",
    options: [
      { key: "selectedCols", type: "columns", default: null },
    ],
  },
  {
    id: "dedup-merge",
    cat: "table",
    icon: "🔗",
    pro: false,
    io: "multifile",
    /* Pasted input supports several tables separated by a line of "---",
       so the tool is usable without uploading files. */
    sample: "id,name,city\n1,Alice,NYC\n2,Bob,LA\n2,Bob,LA\n---\nid,name,city\n3,Carol,SF\n1,Alice,NYC",
    options: [
      {
        key: "joinType", type: "select", default: "union",
        opts: ["union", "inner", "outer"]
      },
      { key: "dedup", type: "checkbox", default: true },
      { key: "dedupKey", type: "text", default: "" },
    ],
  },

  /* ============ CONVERT TOOLS ============ */
  {
    id: "csv-to-json",
    cat: "convert",
    icon: "🔄",
    pro: false,
    io: "text",
    sample: "name,age,active\nAlice,30,true\nBob,25,false",
    options: [
      {
        key: "jsonFrom", type: "select", default: "csv",
        opts: ["csv", "json"]
      },
      { key: "pretty", type: "checkbox", default: true },
      { key: "inferTypes", type: "checkbox", default: true },
    ],
  },
  {
    id: "csv-to-sql",
    cat: "convert",
    icon: "🗄️",
    pro: false,
    io: "text",
    sample: "id,name,price\n1,Widget,9.99\n2,Gadget,19.99\n3,Gizmo,4.50",
    options: [
      { key: "tableName", type: "text", default: "products" },
      {
        key: "dialect", type: "select", default: "mysql",
        opts: ["mysql", "postgres"]
      },
      { key: "createTable", type: "checkbox", default: true },
      { key: "multiRow", type: "checkbox", default: false },
    ],
  },
  {
    id: "csv-to-markdown",
    cat: "convert",
    icon: "📝",
    pro: false,
    io: "text",
    sample: "Feature,Free,Pro\nExport,No,Yes\nSupport,Email,Priority\nTools,3,13",
    options: [
      {
        key: "align", type: "select", default: "left",
        opts: ["left", "center", "right"]
      },
    ],
  },
  {
    id: "json-formatter",
    cat: "convert",
    icon: "{ }",
    pro: false,
    io: "text",
    sample: '{"name":"DataForge","version":1,"tools":["csv","json","sql"],"pro":true,"meta":{"author":"you","year":2026}}',
    options: [
      { key: "minify", type: "checkbox", default: false },
      { key: "sortKeys", type: "checkbox", default: false },
      { key: "indent", type: "number", default: 2 },
    ],
  },
  {
    id: "base64-tool",
    cat: "convert",
    icon: "🔐",
    pro: false,
    io: "text",
    sample: "Hello, DataForge Pro! 你好世界",
    options: [
      {
        key: "base64Mode", type: "select", default: "encode",
        opts: ["encode", "decode", "urlEncode", "urlDecode", "htmlEncode", "htmlDecode"]
      },
    ],
  },

  /* ============ TEXT TOOLS ============ */
  {
    id: "text-batch",
    cat: "text",
    icon: "✂️",
    pro: false,
    io: "text",
    sample: "  apple  \nbanana\n\ncherry\napple\n  date  ",
    options: [
      { key: "find", type: "text", default: "" },
      { key: "replace", type: "text", default: "" },
      { key: "useRegex", type: "checkbox", default: false },
      { key: "trimLines", type: "checkbox", default: true },
      { key: "dropEmpty", type: "checkbox", default: false },
      {
        key: "sort", type: "select", default: "none",
        opts: ["none", "asc", "desc"]
      },
      { key: "prefix", type: "text", default: "" },
      { key: "suffix", type: "text", default: "" },
      { key: "number", type: "checkbox", default: false },
    ],
  },
  {
    id: "case-converter",
    cat: "text",
    icon: "Aa",
    pro: false,
    io: "text",
    sample: "hello world example\nmy variable name\nUser Profile Settings",
    options: [
      {
        key: "target", type: "select", default: "camel",
        opts: ["camel", "pascal", "snake", "kebab", "constant", "space", "title", "sentence", "toggle"]
      },
    ],
  },
  {
    id: "regex-tester",
    cat: "text",
    icon: "⁂",
    pro: false,
    io: "regex",
    sample: "",
    options: [
      { key: "regexPattern", type: "text", default: "\\b\\w+@\\w+\\.\\w+\\b" },
      { key: "flags", type: "text", default: "gi" },
      { key: "regexReplace", type: "text", default: "" },
    ],
  },

  /* ============ IMAGE TOOLS ============ */
  {
    id: "image-batch",
    cat: "image",
    icon: "🖼️",
    pro: false,
    io: "images",
    sample: "",
    options: [
      {
        key: "imageFormat", type: "select", default: "original",
        opts: ["original", "jpeg", "png", "webp"]
      },
      { key: "imageQuality", type: "range", default: 85, min: 1, max: 100 },
      { key: "imageWidth", type: "number", default: 0 },
      { key: "imageHeight", type: "number", default: 0 },
      { key: "imageGrayscale", type: "checkbox", default: false },
      { key: "imageWatermark", type: "text", default: "" },
    ],
  },
];

/* Quick lookup by id */
window.DFP.getTool = function (id) {
  return window.DFP.TOOLS.find(t => t.id === id) || null;
};

/* Category order for display */
window.DFP.CATEGORIES = ["table", "convert", "text", "image"];