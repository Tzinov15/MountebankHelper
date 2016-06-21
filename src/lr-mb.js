'use strict';
// IDEA:30 file streaming for mb
// IDEA:0 Some kind of promised based wrapper around timing functions in NODE that accounts for the async behavior of node
// DONE:70 ERROR CHECKING
// DONE:30 Make sure that resolve value is JSON from updateResponse and addRoute
// IDEA:20 Make function that also converts from mountebank form to clean JSON form
// DOING:0 Cleanup formatting so that it is meeting the linting rules
// DONE:60 Make sure that the body (in the mb-style body) is formatted correctly (not too many quotes)
// DONE:0 Ensure that promises are returned from asynchronous methods as opposed to throwing errors
// DONE:20 Tag all asynchronous methods
// DONE:10 Time the functions that will be involved as potential bottle necks for large responses
// DONE:40 Find a way to test multiple (dynamic number) of update calls for the purposes of timing
// DONE:50 Make helper function that will randomly change a status code on a response every 5 seconds so that we can easily test the update functions


const fetch = require('node-fetch');
const _ = require('lodash');
const mb = require('mountebank');

/* EXECUTION TIME: 6-7 seconds for adding 400,000 random routes, parsing into mountebank-style body, and posting entire imposter to Mountebank */
class Imposter {

  /**
  * Sets up the skelton for the.routeInformation POST request body that will be sent to the Mountebank server to set up the imposter]
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

  /** EXECUTION TIME: 132 ms for 400,000 random routes (100,000 random URIs + 4 verbs) being added via addRoute()
  * [Takes in a route (URI + VERB) and a response body that is to be returned from MB when the given route gets reached]
  * @param  {Object} routeOptions     The options containing information on the route + corresponding mocked response
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

    // If the user doesn't provide a path with a leading slash, we will add it here
    if (routeOptions.uri[0] !== '/') routeOptions.uri = `/${routeOptions.uri}`;

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

  /** EXECUTION TIME: 85 ms for 400,000 random routes (100,000 random URIs + 4 verbs) being parsed from our state and added to our MB-body
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
        // extract the necessary attributes from our response (a verb and route uniquely identifies a single response)
        const statusCode = this.ImposterInformation.routeInformation[route][verb].statusCode;
        const responseHeaders = this.ImposterInformation.routeInformation[route][verb].responseHeaders;
        const responseBody = this.ImposterInformation.routeInformation[route][verb].responseBody;

        // create the MB friendly predicate and response portions
        const mbResponse = Imposter._createResponse(statusCode, responseHeaders, responseBody);

        const mbPredicate = Imposter._createPredicate('equals', { 'method' : verb, 'path' : route } );

        // shove these portions into our final complete response in the form of a stub
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
  * @return {Object}            The mountebank-formatted predicate object that can be added as part of a mountebank stub
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
  * Helper function that will retrieve a response from our swagger-like state based on the supplied path information (verb + uri)
  * @param  {Object} pathToUpdate     An object containing information on which path we're retrieving a response for
  * @param  {String} pathToUpdate.verb     The HTTP method for the complete path
  * @param  {String} pathToUpdate.uri     The relative URI for the complete path the user wants to update
  * @return {Object} The response object (contains statusCode, headers, body) or null if it can't find it
  */
  _getResponse(pathToUpdate) {
    /* Input Validation */
    if (!_.isObject(pathToUpdate)) {
      throw new TypeError('pathToUpdate must be an object');
    }
    if (!_.isString(pathToUpdate.uri)) {
      throw new TypeError('pathToUpdate.uri must be a string');
    }
    if (!_.isString(pathToUpdate.verb)) {
      throw new TypeError('pathToUpdate.verb must be a string');
    }
    const verb = pathToUpdate.verb;
    const uri =  pathToUpdate.uri;
    let responseToUpdate;

    // try to retrieve the response from our state based on the passed in uri and verb
    try {
      responseToUpdate = this.ImposterInformation.routeInformation[uri][verb];
    }
    catch (e) {
      if (e instanceof TypeError) { // A TypeError will be thrown if the uri supplied doesn't exist in our swagger-like state
        console.error(`ERROR (_getResponse) : Could not find a response for ${verb} ${uri}`);
        throw new TypeError(e.message);
      }
      else {
        console.error(`ERROR: ${e.message}`);
        throw new TypeError(e.message);
      }
    }
    // if the uri exists but the corresponding supplied verb does NOT, a TypeError above won't be thrown, but
    // responseToUpdate will be null so we check for that here
    if (responseToUpdate == null) {
      console.error(`ERROR: Could not find a response for ${verb} ${uri}`);
      throw new TypeError(`ERROR: Could not find a response for ${verb} ${uri}`);
    }
    // Return our successfully retrieved response
    return responseToUpdate;
  }

  /** ASYNC-METHOD
   * deletes the old imposter
   * mountebank will return details on the deleted imposter upon a successful delete request
   * unfortunately, it will also return a 200 even when attempting to delete a non-existing imposter
   * therefore, to validate a successful delete request (for the purpose of maintaining resolved promises),
   * we check the body of the response from the delete request
   * @return {Promise}   If we have a successful delete request (see above) then we return a resolved promise containing the contents of the deleted imposter
   */
  _deleteOldImposter() {
    // make DELETE request to the mountebank server (through fetch)...
    return fetch(`http://127.0.0.1:2525/imposters/${this.ImposterInformation.port}`, { method: 'delete' })
    .then(function (response) {   // retrieve the text body from the response
      return response.text();
    })
    .then(function (body) {
      if (body === '{}' ) { // Return rejected promise in case of imposter that never got deleted (or was never there to begin with)
        return Promise.reject(new Error('old imposter was never deleted'));
      }
      else {
        return Promise.resolve(body); // Return resolved promise containing text body from response
      }
    })
    .catch(function (error) {
      return Promise.reject(error); // Return rejected promise for any other issue
    });
  }

  /** CLIENT-FACING METHOD
  * Will update the response code of the specified response (specified via pathToUpdate) by calling _updateResponse
  * @param  {Number} newCode          The new response code that is to be set for the specified response
  * @param  {Object} pathToUpdate     An object containing information on which path they wish to update
  * @param  {String} pathToUpdate.verb     The HTTP method for the complete path the user wants to update
  * @param  {String} pathToUpdate.uri     The relative URI for the complete path the user wants to update
  * @returns {Promise} Will return the promise returned by _updateResponse which will be resolved with the response from the fetch call
  **/

  updateResponseCode(newCode, pathToUpdate) {
    /* Input Validation */
    if (!_.isObject(pathToUpdate)) {
      throw new TypeError('pathToUpdate must be an object');
    }
    if (!_.isString(pathToUpdate.uri)) {
      throw new TypeError('pathToUpdate.uri must be a string');
    }
    if (!_.isString(pathToUpdate.verb)) {
      throw new TypeError('pathToUpdate.verb must be a string');
    }
    if (!_.isNumber(newCode)) {
      throw new TypeError('newCode must be a number');
    }

    return this._updateResponse(newCode, 'statusCode', pathToUpdate);
  }

  /** CLIENT-FACING METHOD
  * Will update the response headers of the specified response (specified via pathToUpdate) by calling _updateResponse
  * @param  {Object} newHeaders          The new headers object that is to be set for the specified response
  * @param  {Object} pathToUpdate     An object containing information on which path they wish to update
  * @param  {String} pathToUpdate.verb     The HTTP method for the complete path the user wants to update
  * @param  {String} pathToUpdate.uri     The relative URI for the complete path the user wants to update
  * @returns {Promise} Will return the promise returned by _updateResponse which will be resolved with the response from the fetch call
  **/

  updateResponseHeaders(newHeaders, pathToUpdate) {
    /* Input Validation */
    if (!_.isObject(pathToUpdate)) {
      throw new TypeError('pathToUpdate must be an object');
    }
    if (!_.isString(pathToUpdate.uri)) {
      throw new TypeError('pathToUpdate.uri must be a string');
    }
    if (!_.isString(pathToUpdate.verb)) {
      throw new TypeError('pathToUpdate.verb must be a string');
    }
    if (!_.isObject(newHeaders)) {
      throw new TypeError('newHeaders must be a object');
    }
    return this._updateResponse(newHeaders, 'responseHeaders', pathToUpdate);
  }
  /** CLIENT-FACING METHOD
  * Will update the response headers of the specified response (specified via pathToUpdate) by calling _updateResponse
  * @param  {String} newBody          The new body that is to be set for the specified response
  * @param  {Object} pathToUpdate     An object containing information on which path they wish to update
  * @param  {String} pathToUpdate.verb     The HTTP method for the complete path the user wants to update
  * @param  {String} pathToUpdate.uri     The relative URI for the complete path the user wants to update
  * @returns {Promise} Will return the promise returned by _updateResponse which will be resolved with the response from the fetch call
  **/

  updateResponseBody(newBody, pathToUpdate) {
    /* Input Validation */
    if (!_.isObject(pathToUpdate)) {
      throw new TypeError('pathToUpdate must be an object');
    }
    if (!_.isString(pathToUpdate.uri)) {
      throw new TypeError('pathToUpdate.uri must be a string');
    }
    if (!_.isString(pathToUpdate.verb)) {
      throw new TypeError('pathToUpdate.verb must be a string');
    }
    if (!_.isString(newBody)) {
      throw new TypeError('newBody must be a string');
    }
    return this._updateResponse(newBody, 'responseBody', pathToUpdate);
  }

  /** ASYNC-METHOD
  * EXECUTION TIME: ~700 ms for generating two random words, updating an imposter body with the two words, and posting to MB 100 times
  * (100 DELETE -> POST requests)
  * This method is being overloaded in order to simplify and consolidate repeating logic
  * The methods updateResponseBody, updateResponseHeaders, updateResponseCode will all call this method with the respective parameters
  * The type of newContent will change depending on the funciton that calls _updateResponse, and the value of attributeToUpdate will respecitvely change as well
  * @param  {Number/String/Body} newContent   The new content that the user wants to set for the specified path
  * @param  {String} attributeToUpdate   The specific attribute within the response that is being updated. This will be specified based on which function calls this
  * @param  {Object} pathToUpdate     An object containting information on which path they wish to update
  * @param  {String} pathToUpdate.verb     The HTTP method for the complete path the user wants to update
  * @param  {String} pathToUpdate.uri     The relative URI for the complete path the user wants to update
  * @return {Promise} A promise (returned on behalf of fetch) that will resolve to the response from mountebank
  */
  _updateResponse(newContent, attributeToUpdate, pathToUpdate) {
    if (!_.isObject(pathToUpdate)) {
      throw new TypeError('pathToUpdate must be an object');
    }
    if (!_.isString(pathToUpdate.uri)) {
      throw new TypeError('pathToUpdate.uri must be a string');
    }
    if (!_.isString(pathToUpdate.verb)) {
      throw new TypeError('pathToUpdate.verb must be a string');
    }
    if (!_.isString(attributeToUpdate)) {
      throw new TypeError('attributeToUpdate must be a string');
    }

    // If the user doesn't provide a path with a leading slash, we will add it here
    if (pathToUpdate.uri[0] !== '/') pathToUpdate.uri = `/${pathToUpdate.uri}`;

    // Get the response we are looking to modify
    const responseToUpdate = this._getResponse(pathToUpdate);

    // set the updated content to our old response
    responseToUpdate[attributeToUpdate] = newContent;

    // recreate our new mountebank structure from our updated-state
    const updatedMounteBankRequest = this._createMBPostRequestBody();

    // only on a resolved promise from _deleteOldImposter do we post our new-updated Imposter. This is to prevent posting a new imposter before the one is deleted
    return this._deleteOldImposter().then(function () {
      return fetch('http://127.0.0.1:2525/imposters', { method: 'post', headers: { 'content-type' : 'application/json' }, body: JSON.stringify(updatedMounteBankRequest) })
      .then(function (response) {
        return response.text();
      })
      .then(function (body) {
        return body;
      })
      .catch(function (error) { // this will catch errors (rejected promises) from the _deleteOldImposter method as well as from the above fetch call to update
        return Promise.reject(error);
      });
    });
  }


  /** CLIENT-FACING METHOD
  * ASYNC METHOD
  * This will take the current Imposter object (this) and make the POST request to the mountebank server to create the new imposter
  * @return {Object}           Returns a promise (returns the node-fetch promise) that resolves the response and rejects with the error message
  */
  postToMountebank() {
    const MBBody = this._createMBPostRequestBody();
    const fetchReturnValue = fetch('http://127.0.0.1:2525/imposters', { method: 'POST', headers: { 'Content-Type' : 'application/json' }, body: JSON.stringify(MBBody) });
    return fetchReturnValue;
  }

  getStateReponse() {
    return this.ImposterInformation.routeInformation;
  }
  getMountebankResponse() {
    return this._createMBPostRequestBody();
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
