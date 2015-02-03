var serverURL = "http://localhost:8080";

if(typeof toArray === "undefined") {
    function toArray(a) {
        return Array.prototype.slice.call(a);
    }
}

function RemoteRequest(clientid, options) {
    var txid = 1;
    var clientid;
    var requests = {};

    var socket = io(options.server || serverURL, { multiplex: false });

    this._stubs = {};

    socket.on('reply', function(reply) {
        console.log(clientid + ": got reply: ", reply);
        // reply on init request

        var cb = requests[reply.txid];

        if(cb) {
            delete requests[reply.txid];
            cb(reply);
        }
    });
    
    socket.on('request', function(request) {
        if(this.onrequest) {
            console.log(clientid + ": process request: ", request);
            try {
                this.onrequest(request.message, function(reply) {
                    console.log(clientid + ": request processed, send reply: ", reply);
                    socket.emit('reply', { txid: request.txid, message: reply });
                });
            } catch(e) {
                console.log(clientid + ": request handler failed: " + e);
                for(p in e) {
                    console.log(p + " = " + e[p]);
                }
                socket.emit('reply', { txid: request.txid, error: "Request failed: " + e });
            }
        } else {
            console.log(clientid + ": request handler not present");
            socket.emit('reply', { txid: request.txid });
        }
    }.bind(this));

    this.request = function(client, message, cb) {
        if(cb) {
            var _txid = txid++;
            requests[_txid] = function (reply) {
                cb(reply);
            };
            socket.emit('request', { client: client, txid: _txid, message: message });
        } else {
            var res = false, xhr = new XMLHttpRequest();

            var url = (options.server || serverURL) + "/request";

            xhr.open("POST", url, false);
            xhr.setRequestHeader("content-type", "application/json");
            xhr.send(JSON.stringify({ client: client, message: message }));

            if (xhr.readyState === xhr.DONE && (xhr.status === 200 || xhr.status === 304)) {
                try {
                    res = JSON.parse(xhr.responseText);
                } catch (e) {
                    console.log("Invalid JSON message: [" + xhr.responseText + "], error:" + e);
                }
            }

            if(res.error) {
                throw(res.error);
            } else {
                return res.message;
            }
        }
    };
    
    this.on = function(event, cb) {
        this[event + "cb"] = cb;
    }

    socket.on('init', function (reply) {
        console.log("got init reply on socket: ", socket);
        this.id = clientid = reply.clientid;
        console.log("client id is: " + clientid);
        this.ready = true;
        if(this.readycb) {
            console.log("invoke readycb");
            this.readycb();
            delete this.readycb;
        } 
    }.bind(this));
    socket.emit('init', { clientid: clientid });
}

function RemoteReflection(clientid, remoteid, options) {
    var rpc = new RemoteRequest(clientid, options);    

    // id -> object
    var id=1, local = {};

    function reflect(item, options) {
        var i, o, p, res;

        if(typeof item == "string") {
            o = window[item];
        } else if(Array.isArray(item) ) {
            o = window;
            for(i = 0; i < item.length; i++) {
                o = o[item[i]];
            }
        } else if(typeof item === "object"){
            o = item;
        } else if(typeof item === "function"){
            o = item;
        } else {
            console.log("unhandled item type: " + typeof item);
        }

        console.log("reflect item: " + item + ", is object: " +  o);
        if(options) {
            console.log("options: " + options);
            for(var P in options) {
                console.log("prop: " + P + " = " + options[P]);
            }
        } else {
            console.log("options not specified");
        }

        local[id] = { o: o }; //, options: options };

        res = { id: id, map: {} };

        id++;

        for(p in o) {
            if(typeof o[p] === "function") {
                res.map[p] = 1;
            } else {
                if(options && options.serialize &&  (typeof o[p] === "string" || typeof o[p] === "number") ) {
                    res.map[p] = o[p];
                } else {
                    res.map[p] = 2;
                }
            }
        }

        return res;
    }

    function invoke(id, property, _reflect, serialize, params) {
        var rs, l = local[id];
        if(l.o) {
            console.log("apply: [" + property + "], on object: " + l.o);

            res =  l.o[property].apply(l.o, params);

            if(_reflect) { 
                console.log("reflect result: " + res);
                res = reflect(res, serialize && { serialize: true });
            }
            return res;
        }
    }

    function get(id, property) {
        var o = local[id].o;
        if(o) {
            console.log("get: " + property + ", from object: ", o);
            return o[property];
        }
    }

    function set(id, property, value) {
        var o = local[id].o;
        if(o) {
            console.log("set: " + property + ", to object: ", o);
            o[property] = value;
        }
    }

    function dispose(id) {
        delete local[id];
    }

    rpc.onrequest = function(message, cb) {
        var method = message.method;
        var params = message.params;

        console.log("reflect rpc, got message: ", message);
        console.log("reflect rpc, method: ", method);

        if(method === "invoke") {
            var res = invoke(params.id, params.property, params.reflect, params.serialize, params.params);
            cb(res);
        } else if(method === "get") {
            var res = get(params.id, params.property);
            cb(res);
        } else if(method === "set") {
            set(params.id, params.property, params.value);
            cb(res);
        } else if(method === "reflect") {
            console.log("got reflect request: ", message);
            var res = reflect(params.item, params.options);
            cb(res);
        } else if(method === "dispose") {
            console.log("got dispose request: ", message);
            var res = dispose(params.id);
            cb(res);
        } else {
            cb( { error: "invalid method: " + message.method } );
        }
    }

    this.reflect = function(item, options) {
        var p, res = rpc.request(remoteid, { method: "reflect", params: { item: item, options: options  } });

        console.log("got reflect response: ", res);

        (function _reflect(id, map, options) {
            
            for(p in map) {
                if(map[p] === 1) { // reflected function
                    //console.log("replace stub with rpc call: to ", res.id, ", method: ", p);
                    var reflect, serialize;
                    if(options && options[p]) {
                        reflect = options[p].reflect;       // if true, reflect all results from invocation of this method
                        serialize = options[p].serialize;   // if true, serialize all properties in the reflected result 
                    }

                    map[p] = (function(id, prop, reflect, serialize) {

                        // suboptimization, generate different closue depending on wether reflection is to be applied or not
                        if (reflect) {
                            console.log("generate reflection mapper");
                            return function() {
                                var res = rpc.request(remoteid, { method: 'invoke', params: { id: id, property: prop, reflect: true, serialize: serialize, params: toArray(arguments) }});
                                console.log("got reflected response: ", res);
                                _reflect(res.id, res.map, { serialize: serialize } );
                                return res.map;
                            };
                        } else {
                            return function() {
                                return rpc.request(remoteid, { method: 'invoke', params: { id: id, property: prop, params: toArray(arguments) }});
                            };
                        }
                        
                    })(id, p, reflect, serialize);
                } else if( (!options || !options.serialize) && map[p] === 2) { // reflected property
                    delete map[p];
                    Object.defineProperty(map, p, { 
                        get: (function(id, prop) { 
                            return function() { 
                                return rpc.request(remoteid, { method: 'get', params: { id: id, property: prop }});
                            };
                        })(id, p),
                        set: (function(id, prop) { 
                            return function(value) { 
                                return rpc.request(remoteid, { method: 'set', params: { id: id, property: prop, value: value }});
                            };
                        })(id, p)
                    });
                }
            }
        })(res.id, res.map, options);
        
        return res.map;
    }

}

