package domain

import (
	"errors"
	"strconv"
	"time"
)

// AvatarMaxBytes matches the user_avatars.data check. The browser crops and
// downscales the photo to 256x256 before upload, which lands far below it.
const AvatarMaxBytes = 256 << 10

// AvatarTypes are the formats a browser renders without help. SVG is excluded:
// it is a document and can carry script.
var AvatarTypes = map[string]bool{"image/jpeg": true, "image/png": true, "image/webp": true}

var ErrNoAvatar = errors.New("no avatar")

type Avatar struct {
	ContentType string
	Data        []byte
	UpdatedAt   time.Time
}

// AvatarPath is where the uploaded photo is served, or "" without one. The
// version changes with every upload, so the response can be cached forever.
func (u User) AvatarPath() string {
	if u.AvatarVersion == 0 {
		return ""
	}
	return "/api/users/" + u.Handle + "/avatar?v=" + strconv.FormatInt(u.AvatarVersion, 10)
}
