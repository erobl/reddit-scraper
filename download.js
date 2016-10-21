var request = require('request');
var fs = require('fs')

function makeurl(subreddit) {
	return "https://www.reddit.com" + subreddit + "/top.json"
}

function makecommenturl(subreddit,id) {
	return "https://www.reddit.com" + subreddit + "/comments/" + id + ".json"

}

function makeuserurl(user) {
	return "https://www.reddit.com/user/" + user + "/about.json"
}

function save_json(id, obj) {
	var string = JSON.stringify(obj)
	fs.writeFile("json/"+id+".json", string, function(err) {
		if(err) {return console.log(err);}
	})
	console.log("wrote file " + id + ".json")
}

function parse_comments(post_obj,subreddit) {
	var requrl = makecommenturl(subreddit,post_obj.id)
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
			}
	)
}

function parse_post_author(post_obj, user) {
	var requrl = makeuserurl(user)
	var properties = {}

	request(
		{url:requrl, qs:properties},
		function(err,response,body) {
			if(err) { console.log("parse_post_author: " + err); return; } 
			// we get the current utc time
			var d = new Date()
			var utc = d.getTime()

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
	var d = new Date()
	var utc = d.getTime()

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

function requesturl(subreddit, after, n) {
	if(n < 0) { return; }
	//first we get each post from each subreddit
	var requrl = makeurl(subreddit)
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

			requesturl(subreddit, readjson.data.after, n-1)
		}
	)
	
}

requesturl("/r/politics", "", 10)



