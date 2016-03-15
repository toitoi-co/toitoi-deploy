'use strict';

const WebSocket = require("ws");
const path = require("path");
const events = require("events");
const walk = require("walk");
const extend = require("extend");
const fs = require("fs-extra");

const config = require("./config.json");

let site = "demo.toitoi.co";
let fakeSource = path.join(__dirname, "fake-source");

let ws = new WebSocket("ws://localhost:6000", {
	headers: {
		"x-connection-key": config.connectionKey
	}
});

ws.on("open", function() {
	function sendMessage(message) {
		ws.send(JSON.stringify(message));
	}
	
	ws.on("message", function(data) {
		let message = JSON.parse(data);
		
		switch(message.messageType) {
			case "hello":
				sendMessage({
					messageType: "getManifest",
					site: site
				});
				break;
			case "manifest":
				let differ = diffManifest(message.manifest);
				
				differ.on("create", (data) => {
					extend(data, {messageType: "store"});
					sendMessage(data);
				});
				
				differ.on("update", (data) => {
					extend(data, {messageType: "store"});
					sendMessage(data);
				});
				
				differ.on("delete", (data) => {
					extend(data, {messageType: "delete"});
					sendMessage(data);
				});
				
				differ.on("end", () => {
					ws.close();
				})
				break;
		}
	});
});

function sourcePath(hostname) {
	return path.join(fakeSource, hostname);
}

function diffManifest(manifest) {
	let emitter = new events.EventEmitter();
	let walker = walk.walk(sourcePath(site));
	
	let manifestMap = {};
	
	manifest.forEach((item) => {
		manifestMap[item.path] = item;
	});
	
	walker.on("file", (root, stat, next) => {
		let itemPath = path.join(root, stat.name).replace(sourcePath(site) + "/", "");
		
		if (manifestMap[itemPath] == null) {
			fs.readFile(path.join(root, stat.name), (err, data) => {
				emitter.emit("create", {
					data: data.toString("base64"),
					path: itemPath
				});
			});
		} else {
			let remoteItem = manifestMap[itemPath];
			delete manifestMap[itemPath];
			
			if (stat.mtime.getTime() !== remoteItem.mtime || stat.size !== remoteItem.size) {
				fs.readFile(path.join(root, stat.name), (err, data) => {
					emitter.emit("update", {
						data: data.toString("base64"),
						path: itemPath
					});
				});
			}
		}
		
		next();
	});
	
	walker.on("end", () => {
		console.log(manifestMap);
		Object.keys(manifestMap).forEach((path) => {
			emitter.emit("delete", {
				path: path
			});
		});
		
		emitter.emit("end");
	});
	
	return emitter;
}