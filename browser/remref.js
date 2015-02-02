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
        var _txid = request.txid;
        if(this.onrequest) {
            console.log(clientid + ": process request: ", request);
            this.onrequest(request.message, function(reply) {
                console.log(clientid + ": request processed, send reply: ", reply);
                socket.emit('reply', { txid: _txid, message: reply });
            });
        } else {
            console.log(clientid + ": request handler not present on: ", this);
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
            return res;
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

    function invoke(item, property, params) {
        var e = local[item];
        if(e) {
            console.log("apply: " + property + ", on object: ", e);
            return e[property].apply(e, params);
        }
    }

    function reflect(item, options) {
        var i, o, p, res;

        if(typeof item == "string") {
            o = window[item];
        } else if(Array.isArray(item) ) {
            o = window;
            for(i = 0; i < item.length; i++) {
                o = o.item[i];
            }
        }

        console.log("reflect item: ", item, ", is object: ", o);

        local[id] = o;

        res = { id: id, map: {} };

        for(p in o) {
            console.log("map property: " + p);
            if(typeof o[p] === "function") {
                res.map[p] = 1;
            } else {
                res.map[p] = 2;
            }
        }

        return res;
    }

    rpc.onrequest = function(message, cb) {
        var method = message.method;
        var params = message.params;

        console.log("reflect rpc, got message: ", message);
        console.log("reflect rpc, method: ", method);

        if(method === "invoke") {
            var res = invoke(params.item, params.propery, params.params);
            cb(res);
        } else if(method === "reflect") {
            console.log("got reflect request: ", message);
            var res = reflect(params.item, params.options);
            cb(res);
        } else {
            cb( { error: "invalid method: " + message.method } );
        }
    }

    this.reflect = function(item, options) {
        var p, map, res = rpc.request(remoteid, { method: "reflect", params: { item: item, options: options  } });

        map = res.map;

        console.log("got reflect map: ", map);

        for(p in map) {
            if(map[p] === 1) { // reflected function
                //console.log("replace stub with rpc call: to ", res.id, ", method: ", p);
                map[p] = (function(item, prop) {
                    return function() {
                        rpc.request(remoteid, { method: 'invoke', params: { item: item, property: prop, params: toArray(arguments) }});
                    }
                })(res.id, p);
            }
        }
        return map;
    }

}





/*



{
    invoke: function (o, m, args) {
        var params = [o,m].concat(toArray(args));
        console.log("params: " + params);
    }

}


var local = {
    foo: function() {
        return rpc.invoke(1, 0, arguments);
    },
    bar: function() {
        return rpc.invoke(1, 1, arguments);
    },
    baz: function() {
        return rpc.invoke(1, 2, arguments);
    }
};


var remote = {
    foo: function() {
        console.log("foo called");
        return false;
    },
    bar: function(a) {
        console.log("bar called with: " + a);
        return true;
    },
    baz: function(a,b) {
        console.log("a + b = " + a + b);
        return a + b;
    }

};




function reflectObject(obj) {
    var p, mirror;

    var mirror = {};

    for(p in obj) {
        if(typeof obj[p] === "function") {
            
        }
    }

    return mirror;
}



function remoteReflect(obj) {
    if(reflectedObjects[obj]) {
        return reflectedObjects[obj];
    }

    rpc("reflect", obj);


}

function runTests(o) {
    o.foo();
    o.bar("hello");
    o.bar(1.2345);
    console.log("baz gave: " + o.baz(100, "$"));
}

runTests(local);
*/
