module.exports = function(sitename, options) {
  return sitename + " {" +
  //"\n" + "    tls " + options.tlsEmail +
  "\n" + "    tls off" +
  "\n" + "    root " + options.siteRoot +
  "\n" + "}"
}
