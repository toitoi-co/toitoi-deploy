module.exports = function(sitename, options) {
  return sitename + ":80 {" +
  //"\n" + "    tls " + options.tlsEmail +
  "\n" + "    tls off" +
  "\n" + "    root " + options.siteRoot +
  "\n" + "}"
}
