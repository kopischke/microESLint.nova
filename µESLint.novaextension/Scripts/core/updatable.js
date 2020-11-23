/**
 * @file Updatable stored item class file.
 */
class Updatable {
  /**
   * A stored value with an update timestamp.
   * This is just a very thin abstraction to keep a tuple in sync.
   * @param {?*} value - The value to store on creation.
   * @property {?*} value - The stored value.
   * @property {?number} time - The UNIX timestamp of the last value update.
   */
  constructor (value) {
    this.value = value !== undefined ? value : null
    this.time = value !== undefined ? Date.now() : null
    this._updates = 0
  }

  /**
   * The current update status of the Updatable.
   * @returns {boolean} Whether an update is pending.
   */
  get updating () { return this._updates > 0 }

  /**
   * Update the stored value, adjusting the update timestamp.
   * @param {?*} value - The value to store. Promises will be `await`ed.
   */
  async update (value) {
    try {
      this._updates += 1
      const updated = await value
      if (updated !== this.value) this.value = updated
      this.time = Date.now()
    } finally {
      if (this._updates > 0) this._updates -= 1
    }
  }
}

exports.Updatable = Updatable
