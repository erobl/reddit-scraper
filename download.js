var limit = require('simple-rate-limiter')
var request = limit(require('request')).to(1).per(100); // as per reddit api
var request_no_limit = require('request') // to PUT on couch server
var fs = require('fs');
var async = require('async');

var couch_server = 'http://reddit:reddit@localhost:5984'
var dbname = 'reddit'

function make_url(subreddit) {
	/* Description: Makes a url for a given subreddit
	 * Inputs: subreddit: subreddit name
	 * Outputs: Url to download the top posts from that subreddit
	 */
	return "https://www.reddit.com" + subreddit + "/top.json"
}

function make_comment_url(subreddit,id) {
	/* Description: Makes a url to get the comments from a thread
	 * Inputs: 
	 * 	subreddit: name of the subreddit
	 * 	id: thread id
	 * Outputs: The url where the comments are located
	 */
	return "https://www.reddit.com" + subreddit + "/comments/" + id + ".json"

}

function make_user_url(user) {
	/* Description: Makes a url to get the user information from the reddit API
	 * Inputs: user: username of the user whose information is obtained
	 * Outputs: Url where that is located in the reddit API
	 */
	return "https://www.reddit.com/user/" + user + "/about.json"
}

function make_couch_url(docname) {
	/* Description: Makes a url to point to the couchdb instalation 
	 * and the document that's going to be pointed at
	 * Inputs: docname: the name of the document
	 * Uses the global variables couch_server and dbname
	 */
	return couch_server + "/" + dbname + "/" +  docname
}

function save_to_file(id, obj) {
	/* Description: Saves a javascript object to a .json file
	 * Inputs: 
	 * 	id: the name of the json file
	 *	obj: object that will be saved
	 * Outputs: none
	 */
	var string = JSON.stringify(obj) // turns object into string
	fs.writeFile("json/"+id+".json", string, function(err) {
		if(err) {return console.log(err);} //asyncronously saves it to disc
	})
}

function save_to_couchdb(id, obj) {
	/* Description: Saves a javascript object to the couchdb database
	 * Inputs: 
	 * 	id: the name of the json file
	 * 	obj: object that will be saved
	 * Outputs: none
	 */
	var options = { // metadata about the http POST request
		uri: make_couch_url(id),
		headers: {
			"Content-Type": "application/json"
		},
		method: 'PUT',
		json: obj,

	} 
	// POST to the couchdb instance
	// We use request_no_limit when interacting with couchDB 
	// as we do not have a limit to how many times we can
	// interact with it.
	request_no_limit(options, function(error, response, body) { 
		if(error) {console.log(error); return;}
		  if (!error && response.statusCode == 200) {
		  }
	}) 
}

function save_json(id, obj) {
	/* Description: a simple intermediary method to swap out
	 * between saving to a file or to couchdb. Saves a javascript
	 * object to either of them.
	 * Inputs: 
	 * 	id: the name of the json file
	 * 	obj: object that will be saved
	 * Outputs: none
	 */
	save_to_couchdb(id, obj)
}

function get_utc_time() {
	/* Description: gets current UTC time
	 * Inputs: none
	 * Outputs: the current time in UTC
	 */
	// we get the current utc time and format it according to reddit's format
	var d = new Date()
	var utc = Math.floor(d.getTime()/1000)

	return utc
}

function replace_authors(comments, dict) {
	/* Description: recursively replaces the author atribute that has the name
	 * with an author atribute which has all the information.
	 * Inputs:
	 * 	comments: a comment object, each comment object has a list of comment objects.
	 *	dict: a dictionary that contains the name of the author as the key and the 
	 *		author object as the value
	 * Outputs: comments object where the author is replaced with an author object with
	 * 	information about the author
	 */
	if(comments == []) {return [];}

	for(var i = 0; i < comments.length; i++) {
		comments[i].comentarios = replace_authors(comments[i].comentarios, dict)
	}

	for(var i = 0; i < comments.length; i++) {
		comments[i].autor = dict[comments[i].autor]
	}

	return comments
}

function get_authors(comments) {
	/* Description: Takes a comment thread and gets a list of all the authors involved on it,
	 * 	ignoring any repeated authors.
	 * Inputs:
	 * 	comments: a comment object
	 * Outputs: a list of the username of the authors in that thread of comments
	 */
	if(comments == []){return [];}

	var author_list = comments.map(function(comment) {return comment.autor;})

	for(var i = 0; i < comments.length; i++) {
		author_list.concat(get_authors(comments[i].comentarios))
	}

	var unique_author_list = author_list.filter(function(elem, pos) {
	    return author_list.indexOf(elem) == pos;
	}).filter(function(elem){return elem != undefined;})

	return unique_author_list
}

function download_authors(author, callback) {
	/* Description: Takes a user name, requests reddit for their information
	 * 	and asyncronously feeds it an anonymous function which creates 
	 * 	the author object and feeds it to the callback function
	 * Inputs: 
	 * 	author: the list of user names which will be requested
	 *	callback: the function to be called when the author object is constructed
	 * Outputs: none
	 */
	if(author == undefined) {return;}
	var requrl = make_user_url(author)
	var properties = {}

	request(
		{url:requrl, qs:properties},
		function(err,response,body) {
			// if the request fails we log it
			if(err){console.log(err); console.log(author); return;}

			// we get the current utc time
			var utc = get_utc_time()

			// try catch because deleted authors crash the program
			try {
			// parse the object from reddit
			var readjson = JSON.parse(body)
			
			// if it can't be parsed, print an error and stop
			if("error" in readjson) {console.log("404 Error: " + author); return;}

			// construct the object
			var author = {
				nombre: readjson.data.name,
				PuntajeComentario: readjson.data.comment_karma,
				PuntajePost: readjson.data.link_karma,
				emailVerificado: readjson.data.has_verified_email,
				creadoEn: readjson.data.created_utc,
				TomadoEn: utc
			}

			// feed it to the callback function
			callback(err, author)
			} catch (err) {
				console.log(author)
			}
		}
	)
}

function format_comment(comment, post, subreddit) {
	/* Descrption: Formats a comment object from the format in the reddit API to 
	 * 	the format which will be saved in the couchDB server.
	 * Inputs: 
	 * 	comment: the comment object from the reddit API
	 *	post: the post from which the comments comes from
	 *	subreddit: the subreddit from which the comment comes from
	 * Outputs: the comment formatted in the shape of the model
	 */
	var utc = get_utc_time()
	
	// format current comment
	var new_comment = { 
		comentario: comment.data.body,
		post: post,
		categoria: subreddit,
		tipo: "comentario",
		autor: comment.data.author,
		puntaje: comment.data.score,
		comentarios: [],
		creadoEn: comment.data.created_utc,
		tomadoEn: utc,
		id: comment.data.id
	}

	try {
		// get the list of replies to that comment
		var replies = comment.data.replies.data.children

		for(var i = 0; i < replies.length; i++) {
			// for each of the child comments we format them and add them to the list
			// of child coments
			new_comment.comentarios.push(format_comment(replies[i], post, subreddit))
		}

		return new_comment
	} catch (err) {
		return new_comment
	}
}

function parse_comments(post_obj,subreddit) {
	/* Descrption: gets a post object and a subreddit and gets the comments from a post
	 * prepares the object with the information that was missing form the front page listing
	 * and then starts to parse the comments
	 * Input: 
	 *	post_obj: a post object 
	 *	subreddit: the subreddit where it comes from
	 * Output: none
	 */
	// we get the url of the comment
	var requrl = make_comment_url(subreddit,post_obj.id)
	var properties = {}
	// we make the request to reddit
	request( 
		{url: requrl, qs:properties}, 
			function(err,response,body) {
				// if the response fails, log it and continue
				if(err) { console.log("parse_comments: " + err); console.log(requrl); return; } 
				// parse the json
				var readjson = JSON.parse(body)
				
				// get the data from the actual post
				var postdata = readjson[0].data.children[0].data
				if(post_obj.tipo == "post/link") {
					// if it's a link we include the url on the post object
					post_obj.Link = postdata.url
				} else {
					// if it's a self post, save the text
					post_obj.Descripcion = postdata.selftext
				}
				
				//add percentage of positive posts
				post_obj.PorcentajePositivo = postdata.upvote_ratio

				//post_obj is ready
				save_json(post_obj.id, post_obj)

				//get the comment data from reddit
				var commentdata = readjson[1].data.children
				var new_comment_array = []
				for(var i = 0; i < commentdata.length; i++) {
						// format each comment recursively
						new_comment_array.push(format_comment(commentdata[i],post_obj.id,subreddit))
				}

				// get a list of all the authors involved in the comment thread
				var author_list = get_authors(new_comment_array)

				// use the async module to request a list of the authors
				async.map(author_list, download_authors, function(err, authors) {
					// fill up a dictionary with th requested author
					var dict = {}
					for(var i = 0; i < authors.length; i++) {
						dict[authors[i].nombre] = authors[i]
					}
					// replace each author placeholder name for the author object
					replaced_comments = replace_authors(new_comment_array,dict)
					
					// save each comment thread to couchdb or a file
					for(var i = 0; i < replaced_comments.length; i++) {
						save_json(replaced_comments[i].id,replaced_comments[i])
					}
				})

			}
	)
}

function parse_post_author(post_obj, user) {
	/* Descrption: takes a post object and a user 
	 * gets the user information and stores it in the post object
	 * When it's done it calls the results into the parse_comments function
	 * Input:
	 * 	post_obj: an object representing the data from the post
	 * 	user: a user who has the post
	 * Output: none
	 */
	var requrl = make_user_url(user)
	var properties = {}

	request(
		{url:requrl, qs:properties},
		function(err,response,body) {
			if(err) { console.log("parse_post_author: " + err); return; } 
			// we get the current utc time
			var utc = get_utc_time()
			
			// parse the json
			var readjson = JSON.parse(body)
			// try to use the parsed object
			try {
			//create the author object
			var author = {
				nombre: readjson.data.name,
				PuntajeComentario: readjson.data.comment_karma,
				PuntajePost: readjson.data.link_karma,
				emailVerificado: readjson.data.has_verified_email,
				creadoEn: readjson.data.created_utc,
				TomadoEn: utc
			}
			// add it to the post object
			post_obj.author = author
			// pass it onto parse_comments
			parse_comments(post_obj, post_obj.categoria)
			} catch (err) {
				// if it can't parse the object, set it as undefined and parse the comments anyway
				console.log(user)
				post_obj.author = "undefined"
				parse_comments(post_obj,post_obj.categoria)
			}
		}
	)
}

function parse_post(post, subreddit) {
	/* Description: Takes the data from a post from the reddit API
	 * and builds a post object, then passes it onto parse_post_author
	 * Inputs: 
	 * 	post: the post object from the reddit API
	 * 	subreddit: the name of the subreddit the post is at
	 */
	// we get the current utc time
	var utc = get_utc_time()

	// we start making the post object here
	var post_obj = {
		categoria: subreddit,
		nombre: post.data.title,
		puntaje: post.data.score,
		tipo: (post.data.is_self ? "post/text" : "post/link"),
		creadoEn: post.data.created_utc,
		tomadoEn: utc,
		id: post.data.id
	}

	// we send the post object to get the information about the author
	parse_post_author(post_obj, post.data.author)
}

function request_url(subreddit, after, n) {
	/* Descrption: Takes a subreddit name and scrapes the page 
	 * identified by the "after" string. If the string is empty
	 * it scrapes the first page. It then calls the next page recursively
	 * until n = 0.
	 *
	 * Input: 
	 * 	subreddit: the name of the subreddit
	 *	after: the string that identifies the current page in the reddit API
	 *	n: the amount of recursions left
	 * Output: none
	 */
	if(n < 0) { return; }
	//first we get each post from each subreddit
	var requrl = make_url(subreddit)
	var properties = {"sort":"top", "t":"day", "after":after}
	
	// we make the request
	request(
	{url:requrl, qs:properties},
		function(err,response,body) {
			// request nth page from the subreddit 
			if(err) { console.log("requesturl: " + err); return; }
			var readjson = JSON.parse(body)
			var posts = readjson.data.children

			// for each post we send the object to parse_post
			for(var i = 0; i < posts.length; i++) {
				parse_post(posts[i],subreddit)
			}
			// recursively call the next page
			request_url(subreddit, readjson.data.after, n-1)
		}
	)
	
}

// we define a list of subreddits to scrape
subreddits = ["/r/politics", "/r/the_donald", "/r/hillaryforamerica", "/r/hillaryforprison", "/r/asktrumpsupporters", "/r/donald_trump", "/r/drumpf", "/r/politicalrevolution", "/r/garyjohnson", "/r/jillstein", "/r/POLITIC", "/r/Ask_Politics"]

// then scrape all the subreddits
for(var i = 0; i < subreddits.length; i++) {
	request_url(subreddits[i], "", 10)
}


