'use strict';

const Promise = require("bluebird");
const WebSocket = require("ws");
const fs = Promise.promisifyAll(require("fs-extra"));
const path = require("path");
const walk = require("walk");

const config = require("./config.json");

let server = new WebSocket.Server({port: 6000});

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
			let targetPath;
			
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
					});
					break;
				case "store":
					targetPath = path.join(deploymentPath(message.site), message.path);
					console.log(targetPath);
					fs.mkdirs(path.dirname(targetPath), () => {
						fs.writeFile(targetPath, new Buffer(message.data, "base64"));
					});
					break;
				case "delete":
					targetPath = path.join(deploymentPath(message.site), message.path);
					console.log(targetPath);
					fs.unlink(targetPath);
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