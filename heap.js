function Heap(comparer) {
  if (typeof comparer !== 'function') throw new TypeError("comparer is not a function");
  this.items = [];
  this.length = 0;
  this.comparer = comparer;
}

Heap.prototype.insert = function (x) {
  var pos = this.length++;
  if (pos >= this.items.length)
    this.items.length *= 2;

  var comparer = this.comparer;
  var parent;
	while (pos > 0 && comparer(x, this.items[parent = (pos - 1) >> 1]) < 0) {
    this.items[pos] = this.items[parent];
    pos = parent;
  }

	this.items[pos] = x;
};

Heap.prototype.pop = function () {
  if (this.length == 0) return void 0;

  var result = this.items[0];
  if (this.length == 1) {
    this.items[--this.length] = void 0;
    return result;
  }

  var x = this.items[this.length - 1];
  this.items[--this.length] = void 0;

  var pos = 0, last = this.length - 1;
  var comparer = this.comparer;
  var next;
  while ((next = 1 + pos + pos) < last) {
    if (comparer(this.items[next], this.items[next + 1]) > 0) next++;
    if (comparer(x, this.items[next]) < 0) break;
    this.items[pos] = this.items[next];
    pos = next;
  }
  if (1 + pos + pos == last && comparer(x, this.items[last]) > 0) {
    this.items[pos] = this.items[last];
    pos = last;
  }
  this.items[pos] = x;

  return result;
}

Object.defineProperty(Heap.prototype, "top", {
  get: function () { return this.items[0]; },
  enumerable: false,
  configurable: true,
});

module.exports = {
  Heap: Heap,
};
