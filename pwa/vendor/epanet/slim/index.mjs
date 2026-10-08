var r = Object.defineProperty;
var a = (i, t, e) => t in i ? r(i, t, { enumerable: !0, configurable: !0, writable: !0, value: e }) : i[t] = e;
var n = (i, t, e) => a(i, typeof t != "symbol" ? t + "" : t, e);
let o = class {
  constructor() {
    n(this, "_instance");
    n(this, "_FS");
  }
  async loadModuleVersion(t) {
    const e = await t();
    this._instance = e, this._FS = e.FS;
  }
  checkEngineLoaded() {
    if (!this._instance)
      throw new Error("EPANET engine not loaded. Call loadModule() first.");
  }
  get isLoaded() {
    return !!this._instance;
  }
  get instance() {
    return this.checkEngineLoaded(), this._instance;
  }
  get FS() {
    return this.checkEngineLoaded(), this._FS;
  }
  get version() {
    const t = this.instance._malloc(4);
    this.instance._EN_getversion(t);
    const e = this.instance.getValue(t, "i32");
    return this.instance._free(t), e;
  }
  getError(t) {
    const e = this.instance._malloc(256);
    this.instance._EN_geterror(t, e, 256);
    const s = this.instance.UTF8ToString(e);
    return this.instance._free(e), s;
  }
  writeFile(t, e) {
    this.FS.writeFile(t, e);
  }
  readFile(t, e) {
    return !e || e === "utf8" ? (e = "utf8", this.FS.readFile(t, {
      encoding: e
    })) : this.FS.readFile(t, {
      encoding: e
    });
  }
};
export {
  o as Workspace
};
