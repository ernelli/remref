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
                console.log(clientid + ": request handler failed: " + e + ", exception: ", e);
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


function decycle(obj, dst, stack) {
    var p;

    //dst = dst || dst.constructor();
    stack = stack || [];

    if(stack.length > 20) {
        console.log("decycle failed, nested properties: ", stack);
        throw "decycle, failed, to many nested properties: ";
    }

    for(p in obj) {
        if(typeof obj[p] === "object") {
            if(stack.indexOf(obj[p]) !== -1) {
                console.log("remove duplicate property: " + p + " at nested level: " + stack.length);
                delete obj[p];
            }

            stack.push(obj);
            console.log("recurr into: " + p);
            decycle(obj[p], false, stack);
            stack.pop();
        }
    }
    return obj;
}

var iter = 0;
var lastprop = [];

function serializeObject(obj, maxdepth, stack) {
    var dst, p;

    if(!stack) {
        console.log("serialize: ", obj, " type:"  + typeof obj);
        iter = 0;
    }

    iter++;
    if(iter > 1000) {
        console.log("bail out, too large object");
        console.log("object stack: ", stack);
        for(var n = 0; n < stack.length; n++) {
            console.log("typeof stack: " + n  + " = " + typeof stack[n] + " + valueOf: " + stack[n].valueOf());
        }
        console.log("property stack: ", lastprop);
        throw "bail";
    }

    stack = stack || [];

    if(stack.length >= maxdepth) {
        return {};
    }

    if(stack.length > 20) {
        console.log("decycle failed, nested properties: ", stack);
        throw "decycle, failed, to many nested properties: ";
    }

    if(stack.indexOf(obj) !== -1) {
        console.log("remove duplicate property: " + p + " at nested level: " + stack.length);
        return {};
    }

    // avoid recursion into global objects
    if(obj === window) {
        console.log("prevent recursion into global object window");
        return {};
    }

    try {

    if(typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean" || typeof obj === "undefined") {
        return obj;
    } else {
        if(obj === null) {
            return null;
        } else if(Array.isArray(obj)) { // serialize array
            dst = [];
            obj.forEach(function(i,v) {
                stack.push(v);
                dst[i] = serializeObject(v, maxdepth, stack);
                stack.pop();
            });
        } else { // serialize object
            dst = {};

            for(p in obj) {
                if(obj.hasOwnProperty(p)) {
                    stack.push(obj);
                    lastprop.push(p);
                    dst[p] = serializeObject(obj[p], maxdepth, stack);
                    lastprop.pop();
                    stack.pop();
                }
            }
        }
    }

    } catch(e) {
        console.log("aborted: ", e);
    }
    return dst;        
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
                if(options && options.serialize &&  (typeof o[p] === "string" || typeof o[p] === "number" || typeof o[p] === "boolean")) {
                    res.map[p] = o[p];
                } else {
                    res.map[p] = 2;
                }
            }
        }

        return res;
    }

    function invoke(_params) {

        var id = _params.id,
        property = _params.property,
        _reflect = _params.reflect,
        serialize = _params.serialize,
        cbmap = _params.cbmap,
        params = _params.params,
        maxdepth = _params.maxdepth || 2;
        
        var i, rs, l = local[id];
        if(l.o) {
            console.log("apply: [" + property + "], on object: " + l.o);

            if(cbmap) { // caller passed callbacks
                console.log("cbmap: ", cbmap);
                console.log("params: ", params);
                for(i = 0; i < params.length; i++) {
                    if(cbmap.map[i]) {
                        console.log("map callback for arg: " + i);
                        params[i] = (function(id, prop) {
                            return function () {
                                var i, params = [];// = toArray(arguments);
                                // copy and remove circular referencs

                                for(i = 0; i < arguments.length; i++) {
                                    params[i] = serializeObject(arguments[i], 2);
                                }
                                //params = serializeObject(params);
                                //params = decycle(params);
                                console.log("invoke callback: ", params);
                                return rpc.request(remoteid, { method: 'invoke', params: { id: id, property: prop, params: params }});
                            }
                        })(cbmap.id, i);
                    }
                }
            }

            res =  l.o[property].apply(l.o, params);

            if(_reflect) { 
                console.log("reflect result: " + res);
                res = reflect(res, serialize && { serialize: true });
            } else {
                console.log("serialize result using maxdepth: " + maxdepth);
                res = serializeObject(res, maxdepth);
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
            var res = invoke(params); //params.id, params.property, params.reflect, params.serialize, params.cbmap, params.params);
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

        (function generate_stubs(id, map, options) {
            
            for(p in map) {
                if(map[p] === 1) { // reflected function
                    //console.log("replace stub with rpc call: to ", res.id, ", method: ", p);
                    var reflect_response, serialize, callback, maxdepth;
                    if(options && options[p]) {
                        reflect_response = options[p].reflect;       // if true, reflect all results from invocation of this method
                        serialize = options[p].serialize;   // if true, serialize all properties in the reflected result 
                        callback = options[p].callback;     // if true, look for callbacks and reflect those
                        maxdepth = options[p].maxdepth;     // if set, sets the max recursion level when serializing results
                    }

                    map[p] = (function(id, prop, reflect_response, serialize, maxdepth) {

                        // suboptimization, generate different closure depending on wether reflection is to be applied or not
                        if (reflect_response) {
                            console.log("generate reflection mapper");
                            return function() {
                                var res = rpc.request(remoteid, { method: 'invoke', params: { id: id, property: prop, reflect: true, serialize: serialize, maxdepth: maxdepth, params: toArray(arguments) }});
                                console.log("got reflected response: ", res);
                                generate_stubs(res.id, res.map, { serialize: serialize } );
                                return res.map;
                            };
                        } else if (callback) {
                            console.log("generate closure stub that maps callbacks for: " + prop);
                            return function() {
                                var cbmap, i, params = toArray(arguments);
                                for(i = 0; i < params.length; i++) {
                                    if(typeof params[i] === "function") {
                                        cbmap = cbmap || {};
                                        cbmap[i] = params[i];
                                        params[i] = i;
                                    }
                                }

                                if(cbmap) {
                                    console.log("reflect callback map:  ", cbmap);
                                    cbmap = reflect(cbmap);
                                    console.log("reflected map: ", cbmap);
                                }

                                return rpc.request(remoteid, { method: 'invoke', params: { id: id, property: prop, cbmap: cbmap, maxdepth: maxdepth, params: params}});
                            };
                        } else  { // simple remote invocation
                            return function() {
                                return rpc.request(remoteid, { method: 'invoke', params: { id: id, property: prop, maxdepth: maxdepth, params: toArray(arguments) }});
                            };
                        }
                        
                    })(id, p, reflect_response, serialize, maxdepth);
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

