var request = require('request');
var fs = require('fs');
var async = require('async');

function make_url(subreddit) {
	return "https://www.reddit.com" + subreddit + "/top.json"
}

function make_comment_url(subreddit,id) {
	return "https://www.reddit.com" + subreddit + "/comments/" + id + ".json"

}

function make_user_url(user) {
	return "https://www.reddit.com/user/" + user + "/about.json"
}

function save_json(id, obj) {
	var string = JSON.stringify(obj)
	fs.writeFile("json/"+id+".json", string, function(err) {
		if(err) {return console.log(err);}
	})
	console.log("wrote file " + id + ".json")
}

function get_utc_time() {
	// we get the current utc time
	var d = new Date()
	var utc = Math.floor(d.getTime()/1000)

	return utc
}

function replace_authors(comments, dict) {
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
	if(author == undefined) {return;}
	var requrl = make_user_url(author)
	var properties = {}

	request(
		{url:requrl, qs:properties},
		function(err,response,body) {
			// we get the current utc time
			if(err){console.log(err); console.log(author); return;}

			var utc = get_utc_time()

			try {
			var readjson = JSON.parse(body)

			if("error" in readjson) {console.log("404 Error: " + author); return;}

			var author = {
				nombre: readjson.data.name,
				PuntajeComentario: readjson.data.comment_karma,
				PuntajePost: readjson.data.link_karma,
				emailVerificado: readjson.data.has_verified_email,
				creadoEn: readjson.data.created_utc,
				TomadoEn: utc
			}

			callback(err, author)
			} catch (err) {
				console.log(author)
			}
		}
	)
}

function format_comment(comment, post, subreddit) {
	var utc = get_utc_time()

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
		var replies = comment.data.replies.data.children

		for(var i = 0; i < replies.length; i++) {
			new_comment.comentarios.push(format_comment(replies[i], post, subreddit))
		}

		return new_comment
	} catch (err) {
		return new_comment
	}
}

function parse_comments(post_obj,subreddit) {
	var requrl = make_comment_url(subreddit,post_obj.id)
	var properties = {}

	request( 
		{url: requrl, qs:properties}, 
			function(err,response,body) {
				if(err) { console.log("parse_comments: " + err); console.log(requrl); return; } 
				var readjson = JSON.parse(body)
				
				var postdata = readjson[0].data
				if(post_obj.tipo === "post/link") {
					post_obj.Link = postdata.url
				} else {
					post_obj.Descripcion = postdata.selftext
				}

				post_obj.PorcentajePositivo = postdata.upvote_ratio

				//post_obj esta listo
				save_json(post_obj.id, post_obj)

				var commentdata = readjson[1].data.children
				var new_comment_array = []
				for(var i = 0; i < commentdata.length; i++) {
						new_comment_array.push(format_comment(commentdata[i],post_obj.id,subreddit))
				}

				var author_list = get_authors(new_comment_array)

				async.map(author_list, download_authors, function(err, authors) {
					var dict = {}
					for(var i = 0; i < authors.length; i++) {
						dict[authors[i].nombre] = authors[i]
					}

					replaced_comments = replace_authors(new_comment_array,dict)

					for(var i = 0; i < replaced_comments.length; i++) {
						save_json(replaced_comments[i].id,replaced_comments[i])
					}
				})

			}
	)
}

function parse_post_author(post_obj, user) {
	var requrl = make_user_url(user)
	var properties = {}

	request(
		{url:requrl, qs:properties},
		function(err,response,body) {
			if(err) { console.log("parse_post_author: " + err); return; } 
			// we get the current utc time
			var utc = get_utc_time()

			var readjson = JSON.parse(body)
			
			var author = {
				nombre: readjson.data.name,
				PuntajeComentario: readjson.data.comment_karma,
				PuntajePost: readjson.data.link_karma,
				emailVerificado: readjson.data.has_verified_email,
				creadoEn: readjson.data.created_utc,
				TomadoEn: utc
			}

			post_obj.author = author
			
			parse_comments(post_obj, post_obj.categoria)
			
		}
	)
}

function parse_post(post, subreddit) {
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
	if(n < 0) { return; }
	//first we get each post from each subreddit
	var requrl = make_url(subreddit)
	var properties = {"sort":"top", "t":"day", "after":after}
	
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

			request_url(subreddit, readjson.data.after, n-1)
		}
	)
	
}

request_url("/r/politics", "", 10)



