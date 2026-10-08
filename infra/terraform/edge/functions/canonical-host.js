// Viewer request: anything that is not the canonical host gets a 301 to the
// same path and query string on it. Rendered by Terraform (canonical host).
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : "";
  if (host === "${canonical}") {
    return request;
  }

  var pairs = [];
  for (var name in request.querystring) {
    var param = request.querystring[name];
    var values = param.multiValue ? param.multiValue : [param];
    for (var i = 0; i < values.length; i++) {
      pairs.push(values[i].value === "" ? name : name + "=" + values[i].value);
    }
  }
  var query = pairs.length ? "?" + pairs.join("&") : "";

  return {
    statusCode: 301,
    statusDescription: "Moved Permanently",
    headers: {
      location: { value: "https://${canonical}" + request.uri + query },
      "cache-control": { value: "max-age=3600" },
    },
  };
}
