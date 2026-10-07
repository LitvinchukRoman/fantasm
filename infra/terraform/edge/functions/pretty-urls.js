// Mirrors frontend/server.js for the prerendered client:
//   /ideas/  -> 301 /ideas
//   /ideas   -> /ideas/index.html
//   /ideas/index.html -> 301 /ideas
// Files with a dot (assets, *.data, sitemap.xml, robots.txt, images) pass through.
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === "/index.html") {
    return redirect("/", request);
  }
  if (uri.length > 11 && uri.endsWith("/index.html")) {
    return redirect(uri.slice(0, -11), request);
  }
  if (uri.length > 1 && uri.endsWith("/")) {
    return redirect(uri.slice(0, -1), request);
  }
  if (uri.indexOf(".") === -1) {
    request.uri = (uri === "/" ? "" : uri) + "/index.html";
  }
  return request;
}

function redirect(location, request) {
  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: location + query(request.querystring) },
      "cache-control": { value: "public, max-age=300" },
    },
  };
}

function query(qs) {
  var keys = Object.keys(qs);
  if (!keys.length) return "";
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var item = qs[key];
    var values = item.multiValue ? item.multiValue : [item];
    for (var j = 0; j < values.length; j++) {
      var value = values[j].value;
      parts.push(
        encodeURIComponent(key) + (value ? "=" + encodeURIComponent(value) : ""),
      );
    }
  }
  return "?" + parts.join("&");
}
