var colors;
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
    colors[wasmparser.BinaryReaderState.EXPORT_SECTION_ENTRY] = 3;
    colors[wasmparser.BinaryReaderState.BEGIN_WASM] = 3;
    colors[wasmparser.BinaryReaderState.IMPORT_SECTION_ENTRY] = 4;
    colors[wasmparser.BinaryReaderState.TYPE_SECTION_ENTRY] = 5;
    colors[wasmparser.BinaryReaderState.GLOBAL_SECTION_ENTRY] = 5;
    colors[wasmparser.BinaryReaderState.FUNCTION_SECTION_ENTRY] = 5;
    colors[wasmparser.BinaryReaderState.MEMORY_SECTION_ENTRY] = 6;
    colors[wasmparser.BinaryReaderState.DATA_SECTION_ENTRY] = 6;
    colors[wasmparser.BinaryReaderState.TABLE_SECTION_ENTRY] = 6;
    colors[wasmparser.BinaryReaderState.ELEMENT_SECTION_ENTRY] = 6;
    colors[wasmparser.BinaryReaderState.NAME_SECTION_ENTRY] = 7;
    colors[wasmparser.BinaryReaderState.RELOC_SECTION_HEADER] = 3;
    colors[wasmparser.BinaryReaderState.RELOC_SECTION_ENTRY] = 7;
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

var perRow = 0x20;
var content;

function toHex(n, width) {
    var s = n.toString(16).toUpperCase();
    while (s.length < width)
        s = '0' + s;
    return s;
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
          var info = [];
          info.push('Type: ' + wasmparser.BinaryReaderState[reader.state]);
          if (reader.result)
            info.push(JSON.stringify(reader.result, null, 2).substring(0, 1024));
          groupSpan.title = info.join('\n');
      }
      groupSpan.classList.add('lst');
      lastPosition = reader.position;
  }
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
}

var wasmparser;
requirejs.config({
  paths: {
    "wasmparser": "https://npmcdn.com/wasmparser/dist/WasmParser"
  }
});
requirejs(["wasmparser"], function (wasmparser_) {
    wasmparser = wasmparser_;
    initialize();
});
