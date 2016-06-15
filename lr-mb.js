'use strict';
// TODO: file streaming for mb
// TODO: Some kind of promised based wrapper around timing functions in NODE that accoutns for the async behavior of node
// TODO: ERROR CHECKING


const fetch = require('node-fetch');
const _ = require('lodash');
const mb = require('mountebank');
const util = require('util');

class Imposter {
  /** CLIENT-FACING METHOD
  * [Sets up the skelton for the.routeInformation POST request body that will be sent to the Mountebank server to set up the imposter]
  * @param  {Number} port     The port.routeInformation number that the imposter is to listen on for incoming requests
  * @param  {String} protocol The.routeInformation protocol that the imposter is to listen on. Options are http, https, tcp, and smtp
  * @return {Object }         Returns an instance of the Imposter class
  */
  constructor(port, protocol) {
    if (!_.isString(protocol)) {
      throw new TypeError('protocol must be a string');
    }
    if (!_.isNumber(port)) {
      throw new TypeError('port must be a number');
    }
    /* This is the JSON representation of our available routes. This will be formatted similarly to swagger. This is NOT the body of our Imposter POST request */
    this.ImposterInformation = {
      'port' : port,
      'protocol': protocol,
      'routeInformation' : {}
    };
  }

  /** CLIENT-FACING METHOD
  * [Takes in a route (URI + VERB) and a response body that is to be returned from MB when the given route gets reached]
  * @param  {Object} routeOptions     The options contianing information on the route + corresponding mocked respone
  * @param  {String} routeOptions.uri The URI of the route the user is wanting to match against
  * @param  {String} routeOptions.verb       The HTTP verb the is wanting to match against
  * @param  {Object} routeOptions.res The desired response that is to be returned when the above URI and method get matched
  * @param  {Number} routeOptions.res.statusCode The status code that will be returned
  * @param  {Object} routeOptions.res.responseHeaders The headers that will be returned
  * @param  {String} routeOptions.res.resposeBody A string representation of the body that will be returned
  * @returns {void}
  */
  addRoute(routeOptions) {
    /* Input Validation */
    if (!_.isObject(routeOptions)) {
      throw new TypeError('routeOptions must be an object');
    }
    if (!_.isString(routeOptions.uri)) {
      throw new TypeError('routeOptions.uri must be a string');
    }
    if (!_.isString(routeOptions.verb)) {
      throw new TypeError('routeOptions.verb must be a string');
    }
    if (!_.isObject(routeOptions.res)) {
      throw new TypeError('routeOptions.res must be an object');
    }
    if (!_.isNumber(routeOptions.res.statusCode)) {
      throw new TypeError('routeOptions.res.statusCode must be a number');
    }
    if (!_.isString(routeOptions.res.responseBody)) {
      throw new TypeError('routeOptions.res.responseBody must be a string');
    }
    if (!_.isObject(routeOptions.res.responseHeaders)) {
      throw new TypeError('routeOptions.res.responseHeaders must be an object');
    }

    /* If we already have an existing object for the given URI (from a different verb),
    * we just want to add the new key value pair consisting of our new verb and its respective response */
    if ( (this.ImposterInformation.routeInformation[routeOptions.uri]) != null) {
      this.ImposterInformation.routeInformation[routeOptions.uri][routeOptions.verb] = routeOptions.res;
    }
    /* If this is the first verb-response stub for this path, we can just create it  */
    else {
      this.ImposterInformation.routeInformation[routeOptions.uri] = {
        [routeOptions.verb] : routeOptions.res
      };
    }
  }

  /**
  * This will take our state (our swagger-like representation of our routes) and construct our mountebank-formatted body
  * This mountebank-formatted body is what gets inserted into our POST request which ultimately creates our imposter
  *  @returns {Object} - A rigidly formatted MounteBank-Friendly object that can be directly sent as a post request to MB
   */
  _createMBPostRequestBody() {
    const CompleteResponse = {
      'port' : this.ImposterInformation.port,
      'protocol': this.ImposterInformation.protocol,
      'stubs': []
    };

    // for each route we have in our state...
    for (const route in this.ImposterInformation.routeInformation) {
      // for each verb contained within that one route...
      for (const verb in this.ImposterInformation.routeInformation[route]) {
        // extract the necassary attributes from our response (a verb and route uniquely identifies a single response)
        const statusCode = this.ImposterInformation.routeInformation[route][verb].statusCode;
        const responseHeaders = this.ImposterInformation.routeInformation[route][verb].responseHeaders;
        const responseBody = this.ImposterInformation.routeInformation[route][verb].responseBody;

        // create the MB friendly predicate and response portions
        const mbResponse = Imposter._createResponse(statusCode, responseHeaders, responseBody);
        const mbPredicate = Imposter._createPredicate('equals', { 'method' : verb, 'path' : route } );


        // shove these portions into our final complete response
        CompleteResponse.stubs.push({
          predicates:[mbPredicate],
          responses: [mbResponse]
        });
      }
    }
    return CompleteResponse;
  }

  /**
  * This will take in the desired response components (status, headers, and body) and construct a mountebank-style response. Takes care of rigid formatting that MB requires
  * @param  {Number} statuscode The status code that the user wishes to have returned from the imposter
  * @param  {Object} headers    The headers to be returned as part of the imposters response
  * @param  {String} body       The body to be returned as part of the imposters response
  * @return {Object}            The mountebank-formatted response object that can be added as part of a mountebank stub
  */
  static _createResponse(statuscode, headers, body) {
    if (!_.isNumber(statuscode)) {
      throw new TypeError('statuscode must be a number');
    }
    if (!_.isObject(headers)) {
      throw new TypeError('headers must be an object');
    }
    if (!_.isString(body)) {
      throw new TypeError('body must be a string');
    }
    const finalResponse = {};
    const response = {};

    response.statuscode = statuscode;
    response.headers = headers;
    response.body = body;
    /* A mountebank formatting thing where each response has a type (is, proxy, or inject) and this type must be specified in the form of a key where the value the actual response */
    finalResponse.is = response;
    return finalResponse;
  }

  /**
  * This will take in the users desired predicate components and construct a mounte-bank style predicate
  * @param  {String} operator   The operator to be used as part of this predicate (see mountebank predicate documentation for list of available operators)
  * @param  {Object} predicateBody       The body of the predicate. Often contains information on what conditions are to be met for a match on incoming request
  * @return {Object}            The mountebank-formatted prediate object that can be added as part of a mountebank stub
  */
  static _createPredicate(operator, predicateBody) {
    if (!_.isString(operator)) {
      throw new TypeError('operator must be a string');
    }
    if (!_.isObject(predicateBody)) {
      throw new TypeError('predicateBody must be an object');
    }
    const predicate = {};
    predicate[operator] = predicateBody;
    return predicate;
  }

  /**
  * Helper function that will retreive a response from our swagger-like state based on the supplied path information (verb + uri)
  * @param  {Object} pathToUpdate     An object containting information on which path we're retreiving a response for
  * @param  {String} pathToUpdate.verb     The HTTP method for the complete path
  * @param  {String} pathToUpdate.uri     The relative URI for the complete path the user wants to update
  * @return {Object} The response object (contains statusCode, headers, body) or throws an error if it can't find it
  */
  _getResponse(pathToUpdate) {
    const verb = pathToUpdate.verb;
    const uri =  pathToUpdate.uri;
    const responseToUpdate = this.ImposterInformation.routeInformation[uri][verb];
    if (responseToUpdate == null) throw new ReferenceError(`Could not find a response for ${verb} ${uri}`);
    return responseToUpdate;
  }

  /**
   * deletes the old imposter
   * mountebank will return details on the deleted imposter upon a succesful delete request
   * unfortunately, it will also return a 200 even when attempting to delete a non-existing imposter
   * therefore, to validate a succesful delete request (for the purpose of maintaining resolved promises),
   * we check the body of the response from the delete request
   * @return {Promise}   If we have a succesful delete request (see above) then we return a resolved promise containting the contents of the deleted imposter
   */
  _deleteOldImposter() {
    return fetch(`http://127.0.0.1:2525/imposters/${this.ImposterInformation.port}`, { method: 'delete' })
    .then(function (response) {
      return response.text();
    })
    .then(function (body) {
      if (body === '{}' ) throw new Error('old imposter was never deleted');
      else {
        return body;
      }
    })
    .catch(function (error) {
      throw new Error('old imposter was never deleted');
    });
  }

  updateResponseCode(newCode, pathToUpdate) {
    this._updateResponse(newCode, 'statusCode', pathToUpdate);
  }
  updateResponseHeaders(newHeaders, pathToUpdate) {
    this._updateResponse(newHeaders, 'responseHeaders', pathToUpdate);
  }
  updateResponseBody(newBody, pathToUpdate) {
    this._updateResponse(newBody, 'responseBody', pathToUpdate);
  }

  /**
  * This method is being overloaded in order to simplify and consolidate repeating logic
  * The methods updateResponseBody, updateResponseHeaders, updateResponseCode will all call this method with the respective parameters
  * The type of newContent will change depending on the funciton that calls _updateResponse, and the value of attributeToUpdate will respecitvely change
  * @param  {Number/String/Body} newContent   The new content that the user wants to set for the specified path
  * @param  {String} attributeToUpdate   The specific attribute within the response that is being updated. This will be specified based on which function calls this
  * @param  {Object} pathToUpdate     An object containting information on which path they wish to update
  * @param  {String} pathToUpdate.verb     The HTTP method for the complete path the user wants to update
  * @param  {String} pathToUpdate.uri     The relative URI for the complete path the user wants to update
  * @return {Promise} A promise (returned on behalf of fetch) that will resolve to the response from mountebank
  */
  _updateResponse(newContent, attributeToUpdate, pathToUpdate) {
    // Get the response we are looking to modify
    const responseToUpdate = this._getResponse(pathToUpdate);

    // set the updated content to our old response
    responseToUpdate[attributeToUpdate] = newContent;

    // recreate our new mountebank structure from our updated-state
    const updatedMounteBankRequest = this._createMBPostRequestBody();

    // only only a resolved promise from _deleteOldImposter do we post our new-updated Imposter. This is to prevent posting a new imposter before the one is deleted
    this._deleteOldImposter().then(function () {
      fetch('http://127.0.0.1:2525/imposters', { method: 'post', headers: { 'content-type' : 'application/json' }, body: JSON.stringify(updatedMounteBankRequest) });
    })
    .catch(function (error) {
      console.log('error: ');
      console.log(error);
    });
  }


  /**
  * This will take the current Imposter object (this) and make the POST request to the mountebank server to create the new imposter
  * @return {Object}           Returns a promise (returns the node-fetch promise) that resolves the response and rejects with the error message
  */
  postToMountebank() {
    const MBBody = this._createMBPostRequestBody();
    const fetchReturnValue = fetch('http://127.0.0.1:2525/imposters', { method: 'POST', headers: { 'Content-Type' : 'application/json' }, body: JSON.stringify(MBBody) });
    return fetchReturnValue;
  }

  printRouteInformation() {
    console.log('~~~ Route Information (Swagger-Like structure)~~~~');
    console.log(util.inspect(this.ImposterInformation.routeInformation, { depth: null }));
  }
  printCompleteResponse() {
    console.log('~~~  Complte Response (Mountebank-Like structure)~~~~');
    console.log(util.inspect(this.CompleteResponse, { depth: null }));
  }
}

function startMbServer() {
  const mbCreateResult = mb.create({
    port           : 2525,
    pidfile        : './mb.pid',
    logfile        : './mb.log',
    loglevel       : 'error',
    mock           : true,
    allowInjection : true,
  });
  return mbCreateResult;
}

module.exports.Imposter = Imposter;
module.exports.startMbServer = startMbServer;
