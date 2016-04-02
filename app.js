'use strict';

const Promise = require("bluebird");
const WebSocket = require("ws");
const fs = Promise.promisifyAll(require("fs-extra"));
const path = require("path");
const walk = require("walk");
const childProcess = Promise.promisifyAll(require("child_process"), {multiArgs: true})

const generateCaddyConfiguration = require("./lib/generate-caddy-configuration");

const config = require("./config.json");

let server = new WebSocket.Server({
	port: config.listen.port,
	host: config.listen.host
});

server.on("connection", function(ws) {
	let connectionKey = ws.upgradeReq.headers["x-connection-key"];
	
	if (connectionKey == null || connectionKey !== config.connectionKey) {
		console.log("Terminated connection for invalid key.")
		ws.terminate();
	} else {
		function sendMessage(message) {
			ws.send(JSON.stringify(message));
		}
		
		ws.on("message", function(data) {
			let message = JSON.parse(data);
			let targetPath, siteRoot;
			
			switch(message.messageType) {
				case "getManifest":
					Promise.try(() => {
						return fs.mkdirs(deploymentPath(message.site));
					}).then(() => {
						return getManifest(message.site);
					}).then((manifest) => {
						sendMessage({
							messageType: "manifest",
							manifest: manifest
						});
					}); // FIXME: Error handling
					break;
				case "store":
					targetPath = path.join(deploymentPath(message.site), message.path);
					console.log(targetPath);
					fs.mkdirs(path.dirname(targetPath), () => { // FIXME: Promises
						fs.writeFile(targetPath, new Buffer(message.data, "base64"));
					});
					break;
				case "delete":
					targetPath = path.join(deploymentPath(message.site), message.path);
					console.log(targetPath);
					fs.unlink(targetPath);
					break;
				case "createSite":
					let config = generateCaddyConfiguration(message.site, {
						tlsEmail: config.tlsEmail,
						siteRoot: deploymentPath(message.site)
					});

					Promise.try(() => {
						return Promise.all([
							fs.writeFileAsync(configPath(message.site), config),
							fs.mkdirsAsync(deploymentPath(message.site))
						]);
					}).then(() => {
						if (config.reloadCommand != null) {
							return childProcess.execFileAsync(config.reloadCommand[0], config.reloadCommand.slice(1));
						}
					}).then(() => {
						sendMessage({
							messageType: "siteCreated",
							site: message.site
						});
					}); // FIXME: Error handling
					break;
			}
		});
		
		sendMessage({
			messageType: "hello",
			version: "1.0"
		});
	}
});

function deploymentPath(hostname) {
	return path.join(config.deploymentRoot, hostname);
}

function configPath(hostname) {
	return path.join(config.configRoot, hostname);
}

function getManifest(hostname) {
	return new Promise((resolve, reject) => {
		let manifest = [];
		
		let walker = walk.walk(deploymentPath(hostname))
		
		walker.on("file", (root, stat, next) => {
			let itemPath = path.join(root, stat.name).replace(deploymentPath(hostname) + "/", "");
			
			manifest.push({
				path: itemPath,
				mtime: stat.mtime.getTime(),
				size: stat.size
			})
			next();
		});
		
		walker.on("nodeError", (root, stat, next) => {
			reject(new Error("Failed at " + root));
		});
		
		walker.on("end", () => {
			resolve(manifest);
		});
	})
}
