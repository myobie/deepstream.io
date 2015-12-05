var C = require( '../constants/constants' );

/**
 * Responsible for keeping track of the other deepstream instances in your cluster
 *
 * The two requirements are:
 * 1. Must work in a distributed fashion ( No central control ) 
 * 2. Server lists should not be stored in cache and storage, instead just in memory ( This helps with distribution by avoiding concurrency issues )
 * 3. Deepstreams that are not closed reliably should be deleted from lists after due time time
 * 
 * @constructor
 * @param {Object} options the extended default options
 */
var Cluster = function( options, httpServer, engineIO, tcpEndpoint ) {
	this._options = options;
	this._messageConnector = options.messageConnector;
	this._httpServer = httpServer;
	this._engineIO = engineIO;
	this._tcpEndpoint = tcpEndpoint;

	this._serverConfig = {
		serverName: options.serverName,
		port: options.port,
		host: options.host,
		tcpPort: options.tcpPort,
		tcpHost: options.tcpHost
	}

	this._servers = {};
	this._timeouts = {};

	this._servers[ this._serverConfig.serverName ] = this._serverConfig;

	this._serverExistsTimeout = null;
	this._notifyOfExistence = this._notifyOfExistence.bind( this );

	this._messageConnector.subscribe( C.CLUSTER.EXPLORE, this._notifyOfExistence );
	this._messageConnector.publish( C.CLUSTER.EXPLORE, {
		serverName: this._serverConfig.serverName 
	} );

	this._subscribeToExisting();
	this._notifyOfExistence();

	this._listenToRequests();
};

/**
* Call to notify other instances the instance is not longer available gracefully
*/
Cluster.prototype.close = function() {
	this._messageConnector.unsubscribe( C.CLUSTER.EXPLORE, this._notifyOfExistence );
 	clearTimeout( this._serverExistsTimeout );

	this._messageConnector.publish( C.CLUSTER.CLOSED , {
		serverName: this._serverConfig.serverName 
	} );
};

/**
* @private
**/
Cluster.prototype._listenToRequests = function() {
	this._httpServer.on( 'request', function( request, response ) {
		if( request.url === '/available-servers' ) {
			response.end( JSON.stringify( this._servers ) )
		}
	}.bind( this ) );
};

/**
* @private
**/
Cluster.prototype._subscribeToExisting = function() {
	this._messageConnector.subscribe( 
		C.CLUSTER.NOTIFY, 
		function( serverConfig ) {
			if( this._validateServerConfig ) {
				if( this._servers[ serverConfig.serverName ] ) {
					clearTimeout( this._timeouts[ serverConfig.serverName ] );
					delete this._timeouts[ serverConfig.serverName ];
				} 

				this._timeouts[ serverConfig.serverName ] = setTimeout( function() {
					delete this._servers[ serverConfig.serverName ];
				}.bind( this ), this._options.clusterHeartbeatIn );

				this._servers[ serverConfig.serverName ] = serverConfig;
			}
		}.bind( this ) 
	);

	this._messageConnector.subscribe(  
		C.CLUSTER.CLOSED,
		function( serverConfig ) {
			if( this._servers[ serverConfig.serverName ] ) {
				delete this._servers[ serverConfig.serverName ];
			} 

			if( this._timeouts[ serverConfig.serverName ] ) {
				clearTimeout( this._timeouts[ serverConfig.serverName ] );
				delete this._timeouts[ serverConfig.serverName ];
			} 
		}.bind( this)
	);
};

/**
* @private
**/
Cluster.prototype._notifyOfExistence = function() {
   this._messageConnector.publish( C.CLUSTER.NOTIFY , this._serverConfig );

   clearTimeout( this._serverExistsTimeout );

   this._serverExistsTimeout = setTimeout( function() {
		this._notifyOfExistence();
   }.bind( this ), this._options.clusterHeartbeatOut );
};

/**
* @private
**/
Cluster.prototype._validateServerConfig = function( serverConfig ) {
	return true;
};

module.exports = Cluster;