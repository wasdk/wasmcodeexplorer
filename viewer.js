var wasmparser = require('wasmparser');
var sourceMapUtils = require('./source-map-utils.js');

var colors;
var annotators;
function initialize() {
  var openButton = document.getElementById('openFile');
  openButton.addEventListener('click', openButtonClicked);
  var browseInput = document.getElementById('browseFile');
  browseInput.addEventListener('change', browseInputChanged);

  var dumpRows = document.getElementById('dump').querySelector('.rows');
  dumpRows.addEventListener('click', rowClicked);
  var text = document.getElementById('text');
  text.addEventListener('click', textClicked);

  colors = Object.create(null);
  colors[wasmparser.BinaryReaderState.BEGIN_SECTION] = 1;
  colors[wasmparser.BinaryReaderState.CODE_OPERATOR] = 2;
  colors[wasmparser.BinaryReaderState.INIT_EXPRESSION_OPERATOR] = 2;
  colors[wasmparser.BinaryReaderState.BEGIN_FUNCTION_BODY] = 3;
  colors[wasmparser.BinaryReaderState.BEGIN_WASM] = 4;
  colors[wasmparser.BinaryReaderState.EXPORT_SECTION_ENTRY] = 5;
  colors[wasmparser.BinaryReaderState.IMPORT_SECTION_ENTRY] = 5;
  colors[wasmparser.BinaryReaderState.TYPE_SECTION_ENTRY] = 5;
  colors[wasmparser.BinaryReaderState.FUNCTION_SECTION_ENTRY] = 5;
  colors[wasmparser.BinaryReaderState.GLOBAL_SECTION_ENTRY] = 6;
  colors[wasmparser.BinaryReaderState.MEMORY_SECTION_ENTRY] = 6;
  colors[wasmparser.BinaryReaderState.DATA_SECTION_ENTRY] = 6;
  colors[wasmparser.BinaryReaderState.TABLE_SECTION_ENTRY] = 6;
  colors[wasmparser.BinaryReaderState.ELEMENT_SECTION_ENTRY] = 6;
  colors[wasmparser.BinaryReaderState.NAME_SECTION_ENTRY] = 7;
  colors[wasmparser.BinaryReaderState.RELOC_SECTION_HEADER] = 3;
  colors[wasmparser.BinaryReaderState.RELOC_SECTION_ENTRY] = 7;

  annotators = Object.create(null);
  annotators[wasmparser.BinaryReaderState.BEGIN_SECTION] = function (result) {
    return 'ID: ' + wasmparser.SectionCode[result.id] +
      (result.name ? '\nName: ' + wasmparser.bytesToString(result.name) : '');
  };
  annotators[wasmparser.BinaryReaderState.INIT_EXPRESSION_OPERATOR] =
    annotators[wasmparser.BinaryReaderState.CODE_OPERATOR] = function (result) {
      return 'Operator: ' + wasmparser.OperatorCode[result.code] + '\n' +
        JSON.stringify(result);
    };
  annotators[wasmparser.BinaryReaderState.TYPE_SECTION_ENTRY] = function (result) {
    if (result.form != wasmparser.Type.func) {
      return defaultAnnotator(result);
    }
    var am = Array.prototype.map;
    return '(' + am.call(result.params, formatType).join(',') + ') : (' +
      am.call(result.returns, formatType).join(',') + ')';
  };
  annotators[wasmparser.BinaryReaderState.IMPORT_SECTION_ENTRY] = function (result) {
    if (result.kind != wasmparser.ExternalKind.Function) {
      return defaultAnnotator(result);
    }
    return JSON.stringify(wasmparser.bytesToString(result.module)) + ' ' +
      JSON.stringify(wasmparser.bytesToString(result.field)) + '\n' +
      'Type Index: ' + result.funcTypeIndex;
  };
  annotators[wasmparser.BinaryReaderState.EXPORT_SECTION_ENTRY] = function (result) {
    if (result.kind != wasmparser.ExternalKind.Function) {
      return defaultAnnotator(result);
    }
    return JSON.stringify(wasmparser.bytesToString(result.field)) + '\n' +
      'Function Index: ' + result.index;
  };
  annotators[wasmparser.BinaryReaderState.NAME_SECTION_ENTRY] = function (result) {
    if (result.type != wasmparser.NameType.Function) {
      return "";
    }
    var names = result.names.slice(0, 20);
    return names.map(function (n) {
      return n.index + ": " + wasmparser.bytesToString(n.name);
    }).join('\n') + (result.names.length > 20 ? '...' : '');
  };
  annotators[wasmparser.BinaryReaderState.DATA_SECTION_ENTRY_BODY] = function (result) {
    return "";
  };
  annotators[wasmparser.BinaryReaderState.SECTION_RAW_DATA] = function (result) {
    return "";
  };

  calcHexMetrics();
}

var selectedGrp = null;
function flashOffset(offset, from) {
  var oldSelection = document.querySelectorAll(".selected");
  for (var i = 0; i < oldSelection.length; i++)
    oldSelection[i].classList.remove('selected');

  selectedGrp = offset;
  if (!offset)
    return;

  var line = document.querySelector(".line[data-offset = '" + offset + "']");
  if (line) {
    if (from === 'grp')
      line.scrollIntoView();
    line.classList.add('selected');
  }

  // FIXME not flashing when no octets rendered
  var grps = document.querySelectorAll(".grp[data-offset = '" + offset + "']");
  if (grps.length === 0) {
    // rows are not cached
    document.getElementById("dump").scrollTop = hexMetrics.lineHeight * Math.floor(offset / perRow);
    updateView();
    grps = document.querySelectorAll(".grp[data-offset = '" + offset + "']");
  }
  if (grps.length > 0 && from === 'line')
    grps[0].scrollIntoView();
  for (var i = 0; i < grps.length; i++)
    grps[i].classList.add('selected');
}

function rowClicked(e) {
  var t = e.target;
  while (t !== document.body && !t.classList.contains('grp'))
    t = t.parentNode;
  if (t === document.body)
    return;
  var offset = t.dataset.offset;
  flashOffset(offset, 'grp');
}

function textClicked(e) {
  var t = e.target;
  while (t !== document.body && !t.classList.contains('line'))
    t = t.parentNode;
  if (t === document.body)
    return;
  var offset = t.dataset.offset;
  flashOffset(offset, 'line');
}

function defaultAnnotator(result) {
  var s = JSON.stringify(result, null, 2);
  if (s.length <= 1024)
    return s;
  return s.substring(0, 1024) + '...';
}

function formatType(type) {
  return wasmparser.Type[type];
}

function openButtonClicked(e) {
  var browseInput = document.getElementById('browseFile');
  browseInput.click();
}

function browseInputChanged(e) {
  var browseInput = document.getElementById('browseFile');
  var file = browseInput.files[0];
  var fileReader = new FileReader();
  fileReader.onload = function (evt) {
    var buffer = evt.target.result;
    var header = new Uint8Array(buffer, 0, 4);
    if (header[0] == 0 && header[1] == 0x61 && header[2] == 0x73 && header[3] == 0x6D)
      openWasm(buffer);
    else
      sourceMapUtils.openMapOrSourceFile(buffer, file.name);
  };
  fileReader.readAsArrayBuffer(file);
}

var perRow = 0x10;
var content;

function toHex(n, width) {
  var s = n.toString(16).toUpperCase();
  while (s.length < width)
    s = '0' + s;
  return s;
}

function annotate(state, result, position) {
  var info = [];
  info.push('Type: ' + wasmparser.BinaryReaderState[state] +
    ' @' + toHex(position, 8));
  if (annotators[state]) {
    info.push(annotators[state].call(null, result));
  } else if (result) {
    info.push(defaultAnnotator(result));
  }
  return info.join('\n');
}

var octetColors = [];

function buildColors() {
  var reader = new wasmparser.BinaryReader();
  reader.setData(content, 0, content.byteLength);
  var lastPosition = reader.position;
  octetColors.length = 0;
  while (reader.read() && reader.state >= 0) {
    if (reader.position <= lastPosition)
      continue;
    octetColors.push({
      offset: lastPosition,
      length: reader.position - lastPosition,
      color: colors[reader.state],
      title: annotate(reader.state, reader.result, lastPosition),
    });
    lastPosition = reader.position;
  }
  if (lastPosition < reader.position) {
    octetColors.push({
      offset: lastPosition,
      length: content.byteLength - lastPosition,
      color: undefined,
      title: reader.state < 0 ? reader.error.message : undefined,
    });
  }
}

function searchOctetColor(octetIndex) {
  var i = 0;
  while (i < octetColors.length) {
    if (octetColors[i].offset <= octetIndex &&
        octetIndex < octetColors[i].offset + octetColors[i].length) {
      return i;
    }
    i++;
  }
  return i;
}

function paintOctets(dump, startRow, endRow) {
  buildColumns(dump, startRow, endRow);
  var j = searchOctetColor(startRow * perRow);

  var item = octetColors[j];
  var groupIndex = startRow * perRow - item.offset;
  var groupLength = item.length;

  for (var r = startRow; r < endRow; r++) {
    var currentRow = cachedRows[r];
    if (currentRow.querySelector('.grp')) {
      for (var skip = perRow; skip >= groupLength - groupIndex;) {
        skip -= groupLength - groupIndex;
        if (++j >= octetColors.length) break;
        groupIndex = 0;
        groupLength = octetColors[j].length; 
      }
      groupIndex += skip;
      continue;
    }
    var groupSpan = null;
    var octets = currentRow.querySelectorAll('.o');
    var itemsCount = Math.min(content.length - r * perRow, perRow);
    for (var i = 0; i < itemsCount; i++) {
      var octet = octets[i];
      if (!groupSpan || groupSpan.parentNode !== octet.parentNode) {
        groupSpan = document.createElement('span');
        groupSpan.className = 'grp';
        if (item.color)
          groupSpan.classList.add('c' + item.color);
        octet.parentNode.insertBefore(groupSpan, octet);
        if (item.title)
          groupSpan.title = item.title;
        groupSpan.dataset.offset = item.offset;
        groupSpan.classList.add('lst');
        if (groupSpan.dataset.offset == selectedGrp)
          groupSpan.classList.add('selected');
      }
      groupSpan.appendChild(octet);
      if (++groupIndex >= groupLength) {
        if (++j >= octetColors.length) break;
        item = octetColors[j];
        groupIndex = 0;
        groupLength = item.length;
        groupSpan = null;
      }
    }
  }
}

function disassemble() {
  var text = document.getElementById('text');
  text.textContent = '';
  try {
    var reader = new wasmparser.BinaryReader();
    reader.setData(content, 0, content.byteLength);
    var dis = new wasmparser.WasmDisassembler();
    dis.addOffsets = true;
    var done = dis.disassembleChunk(reader);
    var result = dis.getResult();
    result.lines.forEach(function (s, index) {
      var line = document.createElement('div');
      line.className = 'line';
      var offset = result.offsets[index];

      // ignoring offset for lines with only '(' and ')'
      var i = 0, j = s.length - 1;
      while (i < j && s[i] === ' ') i++;
      while (i < j && s[j] === ' ') j++;
      if (i === j && (s[i] === '(' || s[i] === ')'))
        offset = undefined;

      line.textContent = s;
      if (offset)
        line.dataset.offset = offset;
      text.appendChild(line);
    });
  } catch (_) {
    // ignoring error
  }
}

var cachedRows = [];
var cachedRowsCount = 0;

function buildColumns(dump, startRow, endRow) {
  var insertIndex = cachedRows.reduce(function (acc, r, index) {
    return r && index < startRow ? acc + 1 : acc;
  }, 0);
  for (var i = startRow; i < endRow; i++, insertIndex++) {
    if (cachedRows[i]) continue;

    var addresses = dump.querySelector('.addresses');
    var rows = dump.querySelector('.rows');
    var asciis = dump.querySelector('.asciis');

    var offset = Math.ceil(hexMetrics.lineHeight * i);
    var address = document.createElement('div');
    address.className = 'address';
    address.style.top = offset + "px";
    var rowOffset = i * perRow;
    address.textContent = "0x" + toHex(rowOffset, 8);
    addresses.insertBefore(address, addresses.childNodes[insertIndex] || null);
    var row = document.createElement('div');
    row.className = 'row';
    row.style.top = offset + "px";
    rows.insertBefore(row, rows.childNodes[insertIndex] || null);
    var ascii = document.createElement('div');
    ascii.className = 'ascii';
    ascii.style.top = offset + "px";
    asciis.insertBefore(ascii, asciis.childNodes[insertIndex] || null);

    cachedRows[i] = row;
    cachedRowsCount++;

    var rowOffset = i * perRow;
    var itemsCount = Math.min(content.length - rowOffset, perRow);
    row.textContent = '';
    var str = '';
    for (var j = 0; j < itemsCount; j++) {
      var b = content[rowOffset + j];
      var octet = document.createElement('span');
      octet.className = 'o';
      octet.textContent = toHex(b, 2);
      row.appendChild(octet);
      str += b >= 32 && b < 127 ? String.fromCharCode(b) : '.';
    }
    ascii.textContent = str;
  }
}

function buildHexDump() {
  var dumpContentHeight = hexMetrics.lineHeight * Math.ceil(content.length / perRow) + "px";

  var dump = document.getElementById('dump');
  var addresses = dump.querySelector('.addresses');
  addresses.textContent = '';
  addresses.style.height = dumpContentHeight;
  var rows = dump.querySelector('.rows');
  rows.textContent = '';
  rows.style.height = dumpContentHeight;
  var asciis = dump.querySelector('.asciis');
  asciis.textContent = '';
  asciis.style.height = dumpContentHeight;
  return dump;
}

var updateViewTimeout = null;
function updateViewThrottled(needLayout) {
  if (updateViewTimeout)
    clearTimeout(updateViewTimeout);
  updateViewTimeout = setTimeout(function () {
    updateViewTimeout = null;
    updateView(needLayout);
  }, 100);
}

var hexMetrics = {
  lineHeight: 0,
  charWidth: 0,
  cellMarginWidth: 0,
};

function calcHexMetrics() {
  var dump = document.getElementById('dump');
  var test = document.createElement('div');
  test.className = "measurement";
  test.textContent = "00000000";
  dump.appendChild(test);
  var rect = test.getBoundingClientRect();
  var width = rect.width, height = rect.height;
  test.className = "measurement-wo-margin";
  var widthWOMargin = test.getBoundingClientRect().width;
  test.remove();

  hexMetrics = {
    lineHeight: Math.floor(height),
    charWidth: widthWOMargin / 8,
    cellMarginWidth: width - widthWOMargin,
  };
}

function purgeCachedItems() {
  cachedRows.forEach(function (row) { row.remove(); });
  cachedRows = [];
}

function layout() {
  purgeCachedItems();
  calcHexMetrics();
  buildHexDump();
}

function updateView(needLayout) {
  if (needLayout) layout();

  var dump = document.getElementById('dump');
  if (cachedRowsCount > 10000) purgeCachedItems();
  // Find rows to display, assume all rows have the same height.
  var start = Math.max(Math.floor(dump.scrollTop / hexMetrics.lineHeight), 0);
  var end = Math.min(Math.ceil((dump.scrollTop + dump.clientHeight) / hexMetrics.lineHeight), Math.ceil(content.length / perRow));
  paintOctets(dump, start, end);
}

document.getElementById("dump").addEventListener("scroll", function (e) { updateView(false); });
window.addEventListener("resize", function (e) { updateView(true); });

function openWasm(buffer) {
  content = new Uint8Array(buffer);
  sourceMap = null;
  buildColors();
  disassemble();
  sourceMapUtils.checkAndLoadDWARF(content);

  updateView(true);
}

function loadForURL(url) {
  fetch(url).then(function (req) { return req.arrayBuffer(); })
    .then(openWasm);
}

initialize();

if (/[?&]api=postmessage/.test(document.location.search)) {
  (window.opener || window.parent).postMessage({
    type: "wasmexplorer-ready"
  }, "*");
  window.addEventListener("message", function (e) {
    if (e.data.type === "wasmexplorer-load") {
      openWasm(e.data.data.buffer);
    }
  });
  document.getElementById('openFile').hidden = true;
} else {
  loadForURL('./helloworld2.wasm');
}
