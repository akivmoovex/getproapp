/**
 * Hostinger / panel compatibility: some UIs default the startup file to `index.js`.
 * The Express app lives in `server.js`; this file only loads it once.
 */
require("./server.js");
