package model

import "slices"

// Principal is the effective identity for a single authorization snapshot.
type Principal struct {
	User        User
	RoleID      int64
	Implicit    bool
	Permissions []Permission // sorted explicit grants; implicit access is never stored here
}

func (p *Principal) Can(grant Permission) bool {
	if p == nil {
		return false
	}
	if p.Implicit {
		return ValidPermission(grant)
	}
	_, ok := slices.BinarySearch(p.Permissions, grant)
	return ok
}

type RoleActions struct {
	Update bool `json:"update"`
	Delete bool `json:"delete"`
}

type Role struct {
	ID          int64        `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description"`
	IsSystem    bool         `json:"is_system"`
	Permissions []Permission `json:"permissions"`
	Actions     RoleActions  `json:"actions"`
}
