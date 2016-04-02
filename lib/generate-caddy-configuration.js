module.exports = function(sitename, options) {
  return sitename + "{" +
  "\n" + "    tls " + options.tlsEmail +
  "\n" + "    root " + options.siteRoot +
  "\n" + "}"
}
