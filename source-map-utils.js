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
  prev = document.querySelectorAll('.source-var');
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
  var lastLineKey = "";
  sourceMapContext.map.forEach(function (item) {
    while (lineIndex < lines.length && lineOffsets[lineIndex] < item.offset)
      lineIndex++;
    if (lineIndex >= lines.length)
      return;
    // FIXME what if we missed address?
    while (lineIndex < lines.length && lineOffsets[lineIndex] >= item.offset) {
      var lineKey = item.file + ',' + item.line;
      if (lastLineKey == lineKey)
        return;
      lastLineKey = lineKey;
      var sourceLine = document.createElement('div');
      sourceLine.className = 'source-line';
      var text = sourceMapContext.sources[item.file] + ':' + item.line;
      if (sourceMapContext.contents[item.file]) {
        text += " \u21e8 ";
        var prefixLen = text.length;
        text += sourceMapContext.contents[item.file][item.line - 1];
        if (!usedLines[item.file][item.line + 1]) {
          var prefix = getPadding(prefixLen);
          var i, lineText;
          for (i = 0; i < 3 && !usedLines[item.file][item.line + i + 1]; i++) {
            lineText = sourceMapContext.contents[item.file][item.line + i];
            if (typeof lineText == 'undefined') break;
            text += '\n' + prefix + lineText;
            usedLines[item.file][item.line + i + 1] = true;
          }
          if (typeof lineText != 'undefined' &&
              !usedLines[item.file][item.line + i + 1])
            text += '\n' + prefix + '...';
        }
      }
      sourceLine.textContent = text;
      lines[lineIndex++].prepend(sourceLine);
    }
  });
  if (sourceMapContext.variables) {
    lineIndex = 0;
    var deletedVars = {};
    sourceMapContext.variables.forEach(function (v) {
      while (lineIndex < lines.length && lineOffsets[lineIndex] < v.start) {
        // FIXME missing some ends/del due to not-precise v.end
        if (deletedVars[lineOffsets[lineIndex]]) {
          var vars = Object.keys(deletedVars[lineOffsets[lineIndex]]);
          if (vars.length > 0) {
            var varsSuffix = document.createElement('span');
            varsSuffix.className = "source-var";
            varsSuffix.textContent = 'del ' + vars.join(',');
            lines[lineIndex].append(varsSuffix);
          }
          delete deletedVars[lineOffsets[lineIndex]];
        }
        lineIndex++;
      }
      if (lineIndex >= lines.length) // FIXME error if we missed address
        return;
      var varsSuffix = document.createElement('span');
      varsSuffix.className = "source-var";
      varsSuffix.textContent = v.name + '=' + v.location;
      lines[lineIndex].append(varsSuffix);
      if (deletedVars[v.start])
        delete deletedVars[v.start][v.name];
      var delVars = deletedVars[v.end] || (deletedVars[v.end] = Object.create(null));
      delVars[v.name] = true;
    });
    while (lineIndex < lines.length) {
      if (deletedVars[lineOffsets[lineIndex]]) {
        var vars = Object.keys(deletedVars[lineOffsets[lineIndex]]);
        if (vars.length > 0) {
          var varsSuffix = document.createElement('span');
          varsSuffix.className = "source-var";
          varsSuffix.textContent = 'del ' + vars.join(',');
          lines[lineIndex].append(varsSuffix);
        }
        delete deletedVars[lineOffsets[lineIndex]];
      }
      lineIndex++;
    }
  }
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

function decodeExpr(expr) {
  var buf = new Uint8Array(expr.length >> 1);
  for (var i = 0; i < expr.length; i += 2)
    buf[i >> 1] = parseInt(expr.substr(i, 2), 16);
  var readU8 = function () { return buf[i++]; };
  var readS8 = function () { return readU8() << 24 >> 24; };
  var readU16 = function () { var w = buf[i] | (buf[i +1] << 8); i += 2; return w; };
  var readS16 = function () { return readU16() << 16 >> 16; };
  var readS32 = function () { var w = buf[i] | (buf[i +1] << 8) | (buf[i +2] << 16) |(buf[i +3] << 24); i += 4; return w; };
  var readU32 = function () { return readS32() >>> 0; };
  var readU = function () {
    var n = 0, shift = 0, b;
    while ((b = readU8()) & 0x80) {
      n |= (b & 0x7F) << shift; shift += 7;
    }
    return n | (b << shift);
  };
  var readS = function () {
    var n = 0, shift = 0, b;
    while ((b = readU8()) & 0x80) {
      n |= (b & 0x7F) << shift; shift += 7;
    }
    n |= b << shift; shift += 7;
    return shift > 32 ? (n << (32 - shift)) >> (32 - shift) : n;
  };
  var i = 0, a, b;
  var stack = ["FP"];
  while (i < buf.length) {
    var code = buf[i++];
    switch (code) {
      case 0x08: // DW_OP_const1u 0x08 1 1-byte constant
        stack.push(readU8());
        break;
      case 0x09: // DW_OP_const1s 0x09 1 1-byte constant
        stack.push(readS8());
        break;
      case 0x0A: // DW_OP_const2u 0x0a 1 2-byte constant
        stack.push(readU16());
        break;
      case 0x0B: // DW_OP_const2s 0x0b 1 2-byte constant
        stack.push(readS16());
        break;
      case 0x0C: // DW_OP_const2u 0x0a 1 2-byte constant
        stack.push(readU32());
        break;
      case 0x0D: // DW_OP_const2s 0x0b 1 2-byte constant
        stack.push(readS32());
        break;
      case 0x10: // DW_OP_constu 0x10 1 ULEB128 constant
        stack.push(readU());
        break;
      case 0x11: // DW_OP_const2s 0x0b 1 2-byte constant
        stack.push(readS());
        break;

      case 0x22: //DW_OP_plus
        b = stack.pop(); a =stack.pop();
        stack.push(a + "+" + b);
        break;
      case 0x23: //DW_OP_plus_uconst
        b = readU(); a =stack.pop();
        stack.push(a + "+" + b);
        break;

      case 0x9F: // DW_OP_stack_value
        return "" + stack.pop();

      case 0xF6: // WASM ext
        b = readU(); a = readS();
        switch (b) {
          case 0:
            return "$var" + a;
        }
        return "ti_" + b + "[" + a + "]";
      default:
        return "?(" + expr + ")";
    }
  }
  return "S[" + stack.pop() + "]";
}

function getVariableLocations(xScopes) {
  if (!xScopes) return void 0;
  var offset = xScopes.code_section_offset || 0;
  var queue = xScopes.debug_info.map(function (i) { return [i, null]; });
  var result = [];
  while (queue.length > 0) {
    var item = queue.shift();
    if (item[0].tag == "variable" || item[0].tag == "formal_parameter") {
      var location = item[0].location;
      var name = item[0].name;
      var ranges;
      if (Array.isArray(location)) {
        ranges = location.map(function (l) {
          return {range: l.range, location: decodeExpr(l.expr)};
        });
      } else if (typeof location === 'string' && item[1]) { // FIXME vtable has no range
        ranges = [{range: item[1], location: decodeExpr(location)}]
      }
      if (ranges)
        ranges.forEach(function (r) {
          result.push({name: name, start: r.range[0] + offset, end: r.range[1] + offset, location: r.location});
        });
    }
    var range = (item[0].high_pc ? [item[0].low_pc, item[0].high_pc] : item[0].range) || item[1];
    if (item[0].children)
      item[0].children.forEach(function (i) { queue.push([i, range]); });
  }
  result.sort(function (a, b) { return a.start - b.start; });
  return result;
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
    } else {
      var last = acc[acc.length - 1];
      mapping = {
        offset: last.offset + buf[0],
        file: last.file + (buf.length > 1 ? buf[1] : 0),
        line: last.line + (buf.length > 1 ? buf[2] : 0),
      };
    };
    acc.push(mapping);
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
  var variables = getVariableLocations(sourceMap['x-scopes']);
  sourceMapContext = {
    map: map,
    sources: sourcesNames,
    contents: contents,
    variables: variables,
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
