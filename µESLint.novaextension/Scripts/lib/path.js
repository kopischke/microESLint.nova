/**
 * @file Path handling additions to Novas’s builtin `Path` API.
 * @version 1.0.0
 * @author Martin Kopischke <martin@kopischke.net>
 * @license MIT
 */
const sep = '/'

/**
 * Get the current user’s qualified $HOME path.
 * @returns {string} The path.
 */
exports.homePath = function () {
  return nova.path.normalize(nova.path.expanduser('~'))
}

/**
 * Get a normalised version of a path but with a *nix conforming root,
 * i.e. “/” instead of “/Volumes/Macintosh HD”. This should correctly
 * handle renamed “Macintosh HD“ root drives and leave paths to other
 * “/Volumes” mount points unmodified.
 * @see {@link https://docs.nova.app/api-reference/path/#normalize-path}
 * @returns {string} The nixalised path.
 * @param {string} path - The path to nixalise.
 */
exports.nixalize = function (path) {
  const normalised = nova.path.normalize(path)
  if (!nova.path.isAbsolute(normalised)) return normalised

  const parts = nova.path.split(normalised)
  if (parts.length < 3 || parts[0] !== sep || parts[1] !== 'Volumes') return normalised

  const root = exports.rootDrive()
  const same = nova.path.split(root).every((el, idx) => parts[idx] === el)
  return same
    ? nova.path.join(...[sep].concat(parts.slice(3)))
    : normalised
}

/**
 * Get the current user’s root filesystem mount point path.
 * This is “/Volumes/Macintosh HD” by default, but the drive name
 * is user configurable. As we rely on a quirk of Nova’s path API
 * to get the symlink path, this might break on API changes.
 * @returns {string} The path.
 * @throws {Error} When the `normalize()` contract changes and the
 * user has renamed their root filesystem drive.
 */
exports.rootDrive = function () {
  const expanded = nova.path.normalize(sep) // expands to “/Volumes/<Drive name>”
  if (expanded !== sep) return expanded // … but that is undocumented behaviour
  const macDefault = nova.path.join(sep, 'Volumes', 'Macintosh HD')
  if (nova.fs.stat(macDefault).isSymbolicLink()) return macDefault
  throw new Error(`Unable to locate mount point for root path “${sep}”`)
}

/**
 * @constant {string} The path separator and path root indicator.
 */
exports.separator = sep
