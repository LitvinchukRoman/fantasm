# Sourced by the fantasm host scripts. Not executed directly.
# shellcheck shell=bash

# host.env is written by the fantasm-configure-host SSM document.
# shellcheck disable=SC1091
. /etc/fantasm/host.env
export AWS_DEFAULT_REGION="$REGION"

ssm_get() {
  aws ssm get-parameter --name "$1" --with-decryption --query 'Parameter.Value' --output text
}
