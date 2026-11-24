package api

import (
	"context"
	"errors"
	"fmt"
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
