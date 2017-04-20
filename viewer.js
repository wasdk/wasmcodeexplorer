var colors;
var annotators;
function initialize() {
    var openButton = document.getElementById('openFile');
    openButton.addEventListener('click', openButtonClicked);
    var browseInput = document.getElementById('browseFile');
    browseInput.addEventListener('change', browseInputChanged);

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
        openWasm(buffer);
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

function paintCode(octets) {
  var reader = new wasmparser.BinaryReader();
  reader.setData(content, 0, content.byteLength);
  var lastPosition = reader.position;
  while (reader.read() && reader.state >= 0) {
      var color = colors[reader.state];
      var groupLength = reader.position - lastPosition;
      if (groupLength == 0) {
          continue;
      }
      var groupSpan = null;
      for (var i = 0; i < groupLength; i++) {
          var octet = octets[lastPosition + i];
          if (!groupSpan || groupSpan.parentNode !== octet.parentNode) {
              groupSpan = document.createElement('span');
              groupSpan.className = 'grp';
              if (color)
                  groupSpan.classList.add('c' + color);
              octet.parentNode.insertBefore(groupSpan, octet);
          }
          groupSpan.appendChild(octet);
          groupSpan.title = annotate(reader.state, reader.result, lastPosition);
      }
      groupSpan.classList.add('lst');
      lastPosition = reader.position;
  }
}

function disassemble(buffer) {
  var text = document.getElementById('text');
  text.textContent = '';
  var reader = new wasmparser.BinaryReader();
  reader.setData(content, 0, content.byteLength);
  var dis = new wasmdis.WasmDisassembler();
  dis.addOffsets = true;
  text.textContent = dis.disassemble(reader);
}
function openWasm(buffer) {
    var dump = document.getElementById('dump');
    var addresses = dump.querySelector('.addresses');
    addresses.textContent = '';
    var rows = dump.querySelector('.rows');
    rows.textContent = '';
    content = new Uint8Array(buffer);
    var rowCount = Math.max(1, Math.ceil(content.length / perRow));
    for (var i = 0; i < rowCount; i++) {
        var row = document.createElement('div');
        row.className = 'row';
        var address = document.createElement('div');
        address.className = 'address';
        var rowOffset = i * perRow;
        address.textContent = toHex(rowOffset, 8);
        addresses.appendChild(address);
        var itemsCount = Math.min(content.length - rowOffset, perRow);
        for (var j = 0; j < itemsCount; j++) {
            var octet = document.createElement('span');
            octet.className = 'o';
            octet.textContent = toHex(content[rowOffset + j], 2);          
            row.appendChild(octet);
        }
        rows.appendChild(row);
    }
    paintCode(dump.querySelectorAll('.o'));
    disassemble(buffer);
}

var wasmparser, wasmdis;
requirejs.config({
  paths: {
    "WasmParser": "https://npmcdn.com/wasmparser/dist/WasmParser",
    "WasmDis": "https://npmcdn.com/wasmparser/dist/WasmDis",
  }
});
requirejs(["WasmParser", "WasmDis"], function (wasmparser_, wasmdis_) {
    wasmparser = wasmparser_;
    wasmdis = wasmdis_;
    initialize();
});
