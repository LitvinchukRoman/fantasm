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

# args: 0 API port, 1 frontend port, 2 origin secret,
#       3 global req/s, 4 per-IP req/min, 5 auth req/min, 6 public host
(app_origin) {
	route {
		# 1. Reject anything that did not come through our CloudFront distribution.
		@not_cloudfront not header X-Fantasm-Origin {args[2]}
		respond @not_cloudfront "forbidden" 403

		# API behavior is unchanged: rate limits, bounded bodies and verified
		# forwarding headers continue to protect Go.
		handle /api/* {
			rate_limit {
				zone global {
					key    static
					events {args[3]}
					window 1s
				}
				zone per_ip {
					key    {client_ip}
					events {args[4]}
					window 1m
				}
			}
			@auth path /api/auth/*/login /api/auth/*/callback
			rate_limit @auth {
				zone auth {
					key    {client_ip}
					events {args[5]}
					window 1m
				}
			}

			request_body {
				max_size 1MB
			}

			reverse_proxy 127.0.0.1:{args[0]} {
				header_up X-Forwarded-For {client_ip}
				header_up X-Real-IP {client_ip}
				transport http {
					dial_timeout 2s
					response_header_timeout 20s
				}
			}
		}

		# CloudFront sends non-asset HTML here only when this environment's
		# frontend_delivery_mode is "ssr".
		handle {
			reverse_proxy 127.0.0.1:{args[1]} {
				# CloudFront connects with the private origin Host. Restore the
				# browser-facing host so React Router constructs public URLs and
				# unsafe SSR API calls send the backend's expected Origin.
				header_up Host {args[6]}
				header_up X-Forwarded-For {client_ip}
				header_up X-Real-IP {client_ip}
				transport http {
					dial_timeout 2s
					response_header_timeout 30s
				}
			}
		}
	}
}

__ORIGIN_HOST_PROD__ {
	import app_origin __PORT_PROD__ __FRONTEND_PORT_PROD__ __SECRET_PROD__ __RL_GLOBAL_PROD__ __RL_IP__ __RL_AUTH__ __PUBLIC_HOST_PROD__
}

__ORIGIN_HOST_DEV__ {
	import app_origin __PORT_DEV__ __FRONTEND_PORT_DEV__ __SECRET_DEV__ __RL_GLOBAL_DEV__ __RL_IP__ __RL_AUTH__ __PUBLIC_HOST_DEV__
}
