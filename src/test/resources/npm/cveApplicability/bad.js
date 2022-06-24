const { JSDOM } = require( "jsdom" );
const { window } = new JSDOM( "" );
const $ = require( "jquery" )( window );
var some_dom_id = readline();
$(some_dom_id).load("whatever.html");
