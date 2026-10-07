# Rendered by configure-host.sh (placeholders __LIKE_THIS__ come from host.env
# and SSM). Do not edit on the box; the next configure run overwrites it.
{
__ACME_EMAIL__
	servers {
		# Only CloudFront may set the client address. Strict mode walks
		# X-Forwarded-For from the right and skips trusted proxies, so a
		# client-supplied X-Forwarded-For cannot spoof {client_ip}.
		trusted_proxies cloudfront
		trusted_proxies_strict
		client_ip_headers X-Forwarded-For
	}
}

# args: 0 upstream port, 1 origin secret, 2 global req/s, 3 per-IP req/min, 4 auth req/min
(api_origin) {
	route {
		# 1. Reject anything that did not come through our CloudFront distribution.
		@not_cloudfront not header X-Fantasm-Origin {args[1]}
		respond @not_cloudfront "forbidden" 403

		# 2. Rate limits. Global ceiling first (protects Go and the DB pool),
		#    then per client IP, then a tighter bucket for login routes.
		rate_limit {
			zone global {
				key    static
				events {args[2]}
				window 1s
			}
			zone per_ip {
				key    {client_ip}
				events {args[3]}
				window 1m
			}
		}
		# Only the routes that start or finish a sign-in. /api/auth/providers is read
		# on every visit to the login page and must not share this small bucket.
		@auth path /api/auth/*/login /api/auth/*/callback
		rate_limit @auth {
			zone auth {
				key    {client_ip}
				events {args[4]}
				window 1m
			}
		}

		# 3. Bound the work a single request can cause.
		request_body {
			max_size 1MB
		}

		reverse_proxy 127.0.0.1:{args[0]} {
			# Replace (not append to) the forwarding headers with the address
			# Caddy verified above. The API trusts the Docker bridge as its
			# proxy and reads the right-most untrusted X-Forwarded-For entry,
			# which is then exactly this single, unspoofable value.
			header_up X-Forwarded-For {client_ip}
			header_up X-Real-IP {client_ip}
			transport http {
				dial_timeout 2s
				response_header_timeout 20s
			}
		}
	}
}

__ORIGIN_HOST_PROD__ {
	import api_origin __PORT_PROD__ __SECRET_PROD__ __RL_GLOBAL_PROD__ __RL_IP__ __RL_AUTH__
}

__ORIGIN_HOST_DEV__ {
	import api_origin __PORT_DEV__ __SECRET_DEV__ __RL_GLOBAL_DEV__ __RL_IP__ __RL_AUTH__
}
