var request = require('request');
var url = require('url');

function makeurl(subreddit) {
	return "https://www.reddit.com" + subreddit + "/top.json"
}

function requesturl(subreddit, after, n) {
	if(n < 0) { return; }
	var requrl = makeurl(subreddit)
	var properties = {"sort":"top", "t":"day", "after":after}
	
	request(
	{url:requrl, qs:properties},
		function(err,response,body) {
			if(err) { console.log(err); return; }
			readjson = JSON.parse(body)
			console.log(readjson.data.after)
			requesturl(subreddit, readjson.data.after, n-1)
		}
	)
	
}

function irequesturl(subreddit, n) {
		if(n < 0) { return; }
	var requrl = makeurl(subreddit)
	var properties = {"sort":"top", "t":"day"}
	
		request(
	{url:requrl, qs:properties},
		function(err,response,body) {
			if(err) { console.log(err); return; }
			readjson = JSON.parse(body)
			console.log(readjson.data.after)
			requesturl(subreddit, readjson.data.after, n-1)
		}
	)
	
}

irequesturl("/r/politics", 10)



