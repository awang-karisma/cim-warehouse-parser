package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
)

type DataloggerSessionsInput struct {
	From   string `query:"from" doc:"Inclusive overlap start date (YYYY-MM-DD or RFC3339)"`
	To     string `query:"to" doc:"Inclusive overlap end date (YYYY-MM-DD or RFC3339)"`
	Query  string `query:"q" doc:"Search across session name, device model, or serial"`
	Limit  int    `query:"limit" doc:"Page size (0 = all)"`
	Offset int    `query:"offset" doc:"Pagination offset"`
}

type DataloggerSessionsOutput struct {
	Body struct {
		Sessions []model.DataloggerSession `json:"sessions"`
		Total    int                       `json:"total"`
	}
}

type DataloggerSessionByIDInput struct {
	ID int64 `path:"id" doc:"Datalogger session ID"`
}

type DataloggerSessionOutput struct {
	Body struct {
		Session model.DataloggerSession `json:"session"`
	}
}

type DataloggerRecordsOutput struct {
	Body struct {
		Records []model.DataloggerRecord `json:"records"`
	}
}

type DataloggerRecordsBatchInput struct {
	Body struct {
		SessionIDs []int64 `json:"session_ids"`
	}
}

type DataloggerRecordsBatchOutput struct {
	Body struct {
		Records map[string][]model.DataloggerRecord `json:"records"`
	}
}

type CreateDataloggerSessionInput struct {
	Body model.DataloggerImportPayload
}

type RenameDataloggerSessionInput struct {
	ID   int64 `path:"id" doc:"Datalogger session ID"`
	Body struct {
		Name string `json:"name"`
	}
}

type DataloggerProfilesOutput struct {
	Body struct {
		Profiles []model.DataloggerProfile `json:"profiles"`
	}
}

type DataloggerProfileConfigInput struct {
	IntervalSeconds     *int    `json:"interval_seconds" required:"false"`
	DurationSeconds     *int64  `json:"duration_seconds" required:"false"`
	StartMode           *string `json:"start_mode" required:"false"`
	StartDelaySeconds   *int    `json:"start_delay_seconds" required:"false"`
	ScheduledStartLocal *string `json:"scheduled_start_local" required:"false"`
	TripNumber          *string `json:"trip_number" required:"false"`
	TripDescription     *string `json:"trip_description" required:"false"`
}

type DataloggerProfileBodyInput struct {
	Name   string                        `json:"name" required:"false"`
	Config *DataloggerProfileConfigInput `json:"config" required:"false"`
}

func (DataloggerProfileConfigInput) Schema(r huma.Registry) *huma.Schema {
	type plainDataloggerProfileConfigInput DataloggerProfileConfigInput
	s := r.Schema(reflect.TypeOf(plainDataloggerProfileConfigInput{}), false, "DataloggerProfileConfigInput")
	s.AdditionalProperties = true
	return s
}

func (DataloggerProfileBodyInput) Schema(r huma.Registry) *huma.Schema {
	type plainDataloggerProfileBodyInput DataloggerProfileBodyInput
	s := r.Schema(reflect.TypeOf(plainDataloggerProfileBodyInput{}), false, "DataloggerProfileBodyInput")
	s.AdditionalProperties = true
	return s
}

type CreateDataloggerProfileInput struct {
	RawBody []byte
	Body    DataloggerProfileBodyInput
}

type CreateDataloggerProfileOutput struct {
	Body struct {
		Status string `json:"status"`
		ID     int64  `json:"id"`
	}
}

type UpdateDataloggerProfileInput struct {
	ID      int64 `path:"id" doc:"Datalogger profile ID"`
	RawBody []byte
	Body    DataloggerProfileBodyInput
}

type DataloggerProfileByIDInput struct {
	ID int64 `path:"id" doc:"Datalogger profile ID"`
}

func (s *Server) handleGetDataloggerSessions(ctx context.Context, input *DataloggerSessionsInput) (*DataloggerSessionsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	sessions, total, err := s.store.QueryDataloggerSessions(ctx, storage.DataloggerSessionFilter{
		From:   input.From,
		To:     input.To,
		Query:  input.Query,
		Limit:  input.Limit,
		Offset: input.Offset,
	})
	if err != nil {
		if errors.Is(err, storage.ErrValidation) {
			return nil, huma.Error400BadRequest(err.Error())
		}
		return nil, huma.Error500InternalServerError("failed to list datalogger sessions", err)
	}
	out := &DataloggerSessionsOutput{}
	out.Body.Sessions = sessions
	out.Body.Total = total
	return out, nil
}

func (s *Server) handleGetDataloggerSession(ctx context.Context, input *DataloggerSessionByIDInput) (*DataloggerSessionOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid session id")
	}
	sess, err := s.store.GetDataloggerSession(ctx, input.ID)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("datalogger session %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to get datalogger session", err)
	}
	out := &DataloggerSessionOutput{}
	out.Body.Session = *sess
	return out, nil
}

func (s *Server) handleGetDataloggerRecords(ctx context.Context, input *DataloggerSessionByIDInput) (*DataloggerRecordsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid session id")
	}
	if _, err := s.store.GetDataloggerSession(ctx, input.ID); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("datalogger session %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to verify datalogger session", err)
	}
	records, err := s.store.GetDataloggerRecords(ctx, input.ID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get datalogger records", err)
	}
	out := &DataloggerRecordsOutput{}
	out.Body.Records = records
	return out, nil
}

func (s *Server) handleGetDataloggerRecordsBatch(ctx context.Context, input *DataloggerRecordsBatchInput) (*DataloggerRecordsBatchOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	grouped, err := s.store.GetDataloggerRecordsBatch(ctx, input.Body.SessionIDs)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get datalogger records batch", err)
	}
	strMap := make(map[string][]model.DataloggerRecord, len(grouped))
	for id, recs := range grouped {
		strMap[strconv.FormatInt(id, 10)] = recs
	}
	out := &DataloggerRecordsBatchOutput{}
	out.Body.Records = strMap
	return out, nil
}

func (s *Server) handleCreateDataloggerSession(ctx context.Context, input *CreateDataloggerSessionInput) (*DataloggerSessionOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	name := strings.TrimSpace(input.Body.Name)
	if name == "" {
		return nil, huma.Error400BadRequest("session name cannot be empty")
	}
	sess := &model.DataloggerSession{
		Name:         name,
		DeviceModel:  strings.TrimSpace(input.Body.DeviceModel),
		SerialNumber: strings.TrimSpace(input.Body.SerialNumber),
	}
	if _, err := s.store.CreateDataloggerSession(ctx, sess, input.Body.Records); err != nil {
		if errors.Is(err, storage.ErrValidation) {
			return nil, huma.Error400BadRequest(err.Error())
		}
		return nil, huma.Error500InternalServerError("failed to create datalogger session", err)
	}
	out := &DataloggerSessionOutput{}
	out.Body.Session = *sess
	return out, nil
}

func (s *Server) handleDeleteDataloggerSession(ctx context.Context, input *DataloggerSessionByIDInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid session id")
	}
	if err := s.store.DeleteDataloggerSession(ctx, input.ID); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("datalogger session %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to delete datalogger session", err)
	}
	out := &StatusOKOutput{}
	out.Body.Status = "ok"
	return out, nil
}

func (s *Server) handleRenameDataloggerSession(ctx context.Context, input *RenameDataloggerSessionInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid session id")
	}
	name := strings.TrimSpace(input.Body.Name)
	if name == "" {
		return nil, huma.Error400BadRequest("session name cannot be empty")
	}
	if err := s.store.RenameDataloggerSession(ctx, input.ID, name); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("datalogger session %d not found", input.ID))
		}
		if errors.Is(err, storage.ErrValidation) {
			return nil, huma.Error400BadRequest(err.Error())
		}
		return nil, huma.Error500InternalServerError("failed to rename datalogger session", err)
	}
	out := &StatusOKOutput{}
	out.Body.Status = "ok"
	return out, nil
}

func parseDataloggerProfileWriteInput(raw []byte) (model.DataloggerProfile, error) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return model.DataloggerProfile{}, huma.Error400BadRequest("invalid JSON body")
	}
	rawName, hasName := top["name"]
	rawConfig, hasConfig := top["config"]
	if !hasName || strings.TrimSpace(string(rawName)) == "null" {
		return model.DataloggerProfile{}, huma.Error400BadRequest("name is required")
	}
	if !hasConfig || strings.TrimSpace(string(rawConfig)) == "null" {
		return model.DataloggerProfile{}, huma.Error400BadRequest("config is required")
	}
	if len(top) != 2 {
		return model.DataloggerProfile{}, huma.Error400BadRequest("request contains unsupported fields")
	}
	var name string
	if err := json.Unmarshal(rawName, &name); err != nil {
		return model.DataloggerProfile{}, huma.Error400BadRequest("name must be a string")
	}
	cfg, err := storage.ParseStrictDataloggerConfigJSON(rawConfig)
	if err != nil {
		var valErr *storage.ValidationError
		if errors.As(err, &valErr) {
			return model.DataloggerProfile{}, huma.Error400BadRequest(valErr.Message)
		}
		return model.DataloggerProfile{}, huma.Error400BadRequest(err.Error())
	}
	return model.DataloggerProfile{
		Name:   name,
		Config: cfg,
	}, nil
}

func (s *Server) handleGetDataloggerProfiles(ctx context.Context, input *struct{}) (*DataloggerProfilesOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	profiles, err := s.store.GetDataloggerProfiles(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list datalogger profiles", err)
	}
	out := &DataloggerProfilesOutput{}
	out.Body.Profiles = profiles
	return out, nil
}

func (s *Server) handleCreateDataloggerProfile(ctx context.Context, input *CreateDataloggerProfileInput) (*CreateDataloggerProfileOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	profile, err := parseDataloggerProfileWriteInput(input.RawBody)
	if err != nil {
		return nil, err
	}
	id, err := s.store.CreateDataloggerProfile(ctx, profile)
	if err != nil {
		if errors.Is(err, storage.ErrValidation) {
			var valErr *storage.ValidationError
			if errors.As(err, &valErr) {
				return nil, huma.Error400BadRequest(valErr.Message)
			}
			return nil, huma.Error400BadRequest(err.Error())
		}
		return nil, huma.Error500InternalServerError("failed to create datalogger profile", err)
	}
	out := &CreateDataloggerProfileOutput{}
	out.Body.Status = "ok"
	out.Body.ID = id
	return out, nil
}

func (s *Server) handleUpdateDataloggerProfile(ctx context.Context, input *UpdateDataloggerProfileInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid datalogger profile id")
	}
	profile, err := parseDataloggerProfileWriteInput(input.RawBody)
	if err != nil {
		return nil, err
	}
	if err := s.store.UpdateDataloggerProfile(ctx, input.ID, profile); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("datalogger profile %d not found", input.ID))
		}
		if errors.Is(err, storage.ErrValidation) {
			var valErr *storage.ValidationError
			if errors.As(err, &valErr) {
				return nil, huma.Error400BadRequest(valErr.Message)
			}
			return nil, huma.Error400BadRequest(err.Error())
		}
		return nil, huma.Error500InternalServerError("failed to update datalogger profile", err)
	}
	out := &StatusOKOutput{}
	out.Body.Status = "ok"
	return out, nil
}

func (s *Server) handleDeleteDataloggerProfile(ctx context.Context, input *DataloggerProfileByIDInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid datalogger profile id")
	}
	if err := s.store.DeleteDataloggerProfile(ctx, input.ID); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("datalogger profile %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to delete datalogger profile", err)
	}
	out := &StatusOKOutput{}
	out.Body.Status = "ok"
	return out, nil
}
