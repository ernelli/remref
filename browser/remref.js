var serverURL = "http://localhost:8080";

function RemoteRequest(id, options) {
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
    
    socket.on('request', function(message) {
        var _txid = message.txid, method = message.method;
        if(this.onrequest) {
            console.log(clientid + ": process request: ", message);
            this.onrequest(message, function(reply) {
                console.log(clientid + ": request processed, send reply: ", reply);
                socket.emit('reply', { txid: _txid, message: reply });
            });
        } else {
            console.log(clientid + ": request handler not present on: ", this);
            socket.emit('reply', { txid: message.txid });
        }
    }.bind(this));

    this.request = function(client, message, cb) {
        var _txid = txid++;
        requests[_txid] = function (reply) {
                cb(reply);
        };
        socket.emit('request', { client: client, txid: _txid, message: message });
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
    socket.emit('init', { clientid: id });
}





if(typeof toArray === "undefined") {
    function toArray(a) {
        return Array.prototype.slice.call(a);
    }
}

var rpc = {
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
