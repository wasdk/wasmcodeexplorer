var wasmparser = require('wasmparser');

var spaces = " ";
function getPadding(len) {
  while (spaces.length < len) spaces += spaces;
  return spaces.substr(0, len);
}

function displaySources() {
  var prev = document.querySelectorAll('.source-line');
  for (var i = 0; i < prev.length; i++)
    prev[i].parentNode.removeChild(prev[i]);
  if (!sourceMapContext) return;
  var usedLines = sourceMapContext.sources.map(function () { return [] });
  sourceMapContext.map.forEach(function (item) {
    usedLines[item.file][item.line] = true;
  });

  var lines = document.querySelectorAll(".line[data-offset]");
  var lineOffsets = Array.prototype.map.call(lines, function (line) {
    return +line.getAttribute('data-offset');
  });
  var lineIndex = 0;
  sourceMapContext.map.forEach(function (item) {
    while (lineIndex < lines.length && lineOffsets[lineIndex] < item.offset)
      lineIndex++;
    if (lineIndex >= lines.length || lineOffsets[lineIndex] > item.offset)
      return;
    var sourceLine = document.createElement('div');
    sourceLine.className = 'source-line';
    var text = sourceMapContext.sources[item.file] + ':' + item.line;
    if (sourceMapContext.contents[item.file]) {
      text += " \u21e8 ";
      var prefixLen = text.length;
      text += sourceMapContext.contents[item.file][item.line - 1];
      if (!usedLines[item.file][item.line + 1]) {
        var prefix = getPadding(prefixLen);
        var i;
        for (i = 0; i < 3 && !usedLines[item.file][item.line + i + 1]; i++) {
          text += '\n' + prefix;
          text += sourceMapContext.contents[item.file][item.line + i];
          usedLines[item.file][item.line + i + 1] = true;
        }
        if (!usedLines[item.file][item.line + i + 1])
          text += '\n' + prefix + '...';
      }
    }
    sourceLine.textContent = text;
    lines[lineIndex++].prepend(sourceLine);
  });
}

var sourceMap = null;
var sources = {};
function openMapOrSourceFile(buffer, name) {
  var content = new TextDecoder("utf-8").decode(buffer);
  if (name.endsWith(".map")) {
    sourceMap = JSON.parse(content);
  } else {
    sources[name] = content.split('\n');
  }
  updateSourceMapView();
}

var vlqItemBuf = [];
function readBase64VLQ(item) {
  var value = 0;
  var shift = 0;
  vlqItemBuf.length = 0;
  for (var i = 0; i < item.length; i++) {
    var ch = item.charCodeAt(i);
    if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch < 103)) {
      // last number digit
      var digit = ch < 97 ? ch - 65 : ch - 97 + 26;
      value |= digit << shift;
      vlqItemBuf.push((value & 1) ? -(value >> 1) : (value >> 1));
      value = 0;
      shift = 0;
      continue;
    }
    if (!(ch >= 103 && ch <= 122) && !(ch >= 48 && ch <= 57) &&
      ch != 43 && ch != 47) {
      throw new Error("invalid VLQ digit");
    }
    var digit = ch > 57 ? ch - 103 : (ch >= 48 ? ch - 48 + 20 : (ch == 43 ? 30 : 31));
    value |= digit << shift;
    shift += 5;
  }
  return vlqItemBuf;
}

var sourceMapContext = null;
function updateSourceMapView() {
  var map = sourceMap.mappings.split(',').reduce(function (acc, item) {
    var buf = readBase64VLQ(item);
    var mapping;
    if (acc.length == 0) {
      mapping = {
        offset: buf[0],
        file: buf[1],
        line: buf[2] + 1,
      };
      acc.push(mapping);
    } else {
      var last = acc[acc.length - 1];
      mapping = {
        offset: last.offset + buf[0],
        file: last.file + (buf.length > 1 ? buf[1] : 0),
        line: last.line + (buf.length > 1 ? buf[2] : 0),
      };
      if (last.file != mapping.file || last.line != mapping.line)
        acc.push(mapping);
    };
    return acc;
  }, [])
  map.sort(function (a, b) { return a.offset - b.offset; });

  var contents = (sourceMap.sourcesContent || []).map(function (c) {
    return c ? c.split('\n') : null;
  });
  for (var s in sources) {
    if (!sources.hasOwnProperty(s)) continue;
    sourceMap.sources.some(function (item, index) {
      if (item == s || item.endsWith('/' + s)) {
        contents[index] = sources[s];
        return true;
      }
      return false;
    });
  }
  var sourcesNames = sourceMap.sources.map(function (name) {
    var j = name.lastIndexOf('/');
    return j < 0 ? name : name.substring(j + 1);
  });
  sourceMapContext = {
    map: map,
    sources: sourcesNames,
    contents: contents,
  };
  displaySources();
}

var dwarfToJSONInstance = null;
function checkAndLoadDWARF(content) {
  var reader = new wasmparser.BinaryReader();
  reader.setData(content, 0, content.byteLength);
  var debugInfoFound = false;
  while (reader.read() && reader.state >= 0) {
    if (reader.state == wasmparser.BinaryReaderState.BEGIN_SECTION) {
      if (reader.result.id == wasmparser.SectionCode.Custom &&
          wasmparser.bytesToString(reader.result.name) == ".debug_info") {
          debugInfoFound = true;
          break;
      }
      reader.skipSection();
    }
  }
  if (!debugInfoFound) return;
  if (!dwarfToJSONInstance) {
    var dwarfToJSONPath = 'https://unpkg.com/dwarf-to-json@0.1.4/dwarf_to_json.wasm';
    dwarfToJSONInstance = WebAssembly.instantiateStreaming(fetch(dwarfToJSONPath)).then(
      function (res) { return res.instance; }
    );
  }
  dwarfToJSONInstance.then(function (instance) {
    var alloc_mem = instance.exports.alloc_mem;
    var free_mem = instance.exports.free_mem;
    var convert_dwarf = instance.exports.convert_dwarf;
    var memory  = instance.exports.memory;

    var utf8Decoder = new TextDecoder("utf-8");
    var wasmPtr = alloc_mem(content.byteLength);
    new Uint8Array(memory.buffer, wasmPtr, content.byteLength).set(content);
    var resultPtr = alloc_mem(12);
    convert_dwarf(wasmPtr, content.byteLength, resultPtr, resultPtr + 4, true);
    free_mem(wasmPtr);
    var resultView = new DataView(memory.buffer, resultPtr, 12);
    var outputPtr = resultView.getUint32(0, true), outputLen = resultView.getUint32(4, true);
    free_mem(resultPtr);
    var output = utf8Decoder.decode(new Uint8Array(memory.buffer, outputPtr, outputLen));
    free_mem(outputPtr);
    sourceMap = JSON.parse(output);
    updateSourceMapView()
  });
}

module.exports = {
  openMapOrSourceFile: openMapOrSourceFile,
  checkAndLoadDWARF: checkAndLoadDWARF,
};
