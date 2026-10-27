package api

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/storage"
)

// Delivery Candidates types

type DeliveryCandidatesOutput struct {
	Body struct {
		Orders []model.Order `json:"orders"`
	}
}

func (s *Server) handleGetDeliveryCandidates(ctx context.Context, input *struct{}) (*DeliveryCandidatesOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	orders, err := s.store.GetDeliveryCandidateOrders(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get delivery candidate orders", err)
	}
	out := &DeliveryCandidatesOutput{}
	out.Body.Orders = orders
	return out, nil
}

// Delivery Driver types and handlers

type DeliveryDriversOutput struct {
	Body struct {
		Drivers []model.DeliveryDriver `json:"drivers"`
	}
}

type CreateDeliveryDriverInput struct {
	Body model.DeliveryDriver
}

type CreateDeliveryDriverOutput struct {
	Body struct {
		Status string               `json:"status"`
		ID     int64                `json:"id"`
		Driver model.DeliveryDriver `json:"driver,omitempty"`
	}
}

type UpdateDeliveryDriverInput struct {
	ID   int64 `path:"id" doc:"Delivery Driver ID"`
	Body model.DeliveryDriver
}

type DeleteDeliveryDriverInput struct {
	ID int64 `path:"id" doc:"Delivery Driver ID"`
}

func (s *Server) handleGetDeliveryDrivers(ctx context.Context, input *struct{}) (*DeliveryDriversOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	drivers, err := s.store.GetDeliveryDrivers(ctx)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get delivery drivers", err)
	}
	out := &DeliveryDriversOutput{}
	out.Body.Drivers = drivers
	return out, nil
}

func (s *Server) handleCreateDeliveryDriver(ctx context.Context, input *CreateDeliveryDriverInput) (*CreateDeliveryDriverOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	name := strings.TrimSpace(input.Body.Name)
	if name == "" {
		return nil, huma.Error400BadRequest("driver name cannot be empty")
	}
	input.Body.Name = name
	input.Body.Active = true

	id, err := s.store.CreateDeliveryDriver(ctx, input.Body)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, huma.Error400BadRequest(fmt.Sprintf("driver '%s' already exists", name))
		}
		return nil, huma.Error500InternalServerError("failed to create delivery driver", err)
	}

	driver := input.Body
	driver.ID = id

	out := &CreateDeliveryDriverOutput{}
	out.Body.Status = "ok"
	out.Body.ID = id
	out.Body.Driver = driver
	return out, nil
}

func (s *Server) handleUpdateDeliveryDriver(ctx context.Context, input *UpdateDeliveryDriverInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid driver id")
	}
	name := strings.TrimSpace(input.Body.Name)
	if name == "" {
		return nil, huma.Error400BadRequest("driver name cannot be empty")
	}
	input.Body.Name = name

	if err := s.store.UpdateDeliveryDriver(ctx, input.ID, input.Body); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("driver %d not found", input.ID))
		}
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return nil, huma.Error400BadRequest(fmt.Sprintf("driver '%s' already exists", name))
		}
		return nil, huma.Error500InternalServerError("failed to update delivery driver", err)
	}

	return &StatusOKOutput{
		Body: StatusOKResponse{Status: "ok"},
	}, nil
}

func (s *Server) handleDeleteDeliveryDriver(ctx context.Context, input *DeleteDeliveryDriverInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid driver id")
	}
	if err := s.store.DeleteDeliveryDriver(ctx, input.ID); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("driver %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to delete delivery driver", err)
	}
	return &StatusOKOutput{
		Body: StatusOKResponse{Status: "ok"},
	}, nil
}

// Delivery Runs types and handlers

type GetDeliveryRunsInput struct {
	DeliveryDate string `query:"delivery_date" doc:"Filter by delivery date (YYYY-MM-DD)"`
	Status       string `query:"status" doc:"Filter by run status (PLANNED, PICKING, READY, DISPATCHED, COMPLETED)"`
	DriverName   string `query:"driver_name" doc:"Filter by driver name"`
	Area         string `query:"area" doc:"Filter by area"`
}

type GetDeliveryRunsOutput struct {
	Body struct {
		Runs []model.DeliveryRun `json:"runs"`
	}
}

type GetDeliveryRunInput struct {
	ID int64 `path:"id" doc:"Delivery Run ID"`
}

type GetDeliveryRunOutput struct {
	Body struct {
		Run model.DeliveryRun `json:"run"`
	}
}

type CreateDeliveryRunInput struct {
	Body model.DeliveryRun
}

type CreateDeliveryRunOutput struct {
	Body struct {
		Status string            `json:"status"`
		ID     int64             `json:"id"`
		Run    model.DeliveryRun `json:"run"`
	}
}

type UpdateDeliveryRunInput struct {
	ID   int64 `path:"id" doc:"Delivery Run ID"`
	Body model.DeliveryRun
}

type UpdateDeliveryRunOutput struct {
	Body struct {
		Status string            `json:"status"`
		Run    model.DeliveryRun `json:"run"`
	}
}

type UpdateDeliveryRunStatusInput struct {
	ID   int64 `path:"id" doc:"Delivery Run ID"`
	Body struct {
		Status string `json:"status" doc:"New status (PLANNED, PICKING, READY, DISPATCHED, COMPLETED)"`
	}
}

type UpdateDeliveryRunDriverInput struct {
	ID   int64 `path:"id" doc:"Delivery Run ID"`
	Body struct {
		DriverID   int64  `json:"driver_id,omitempty" doc:"Driver ID from roster"`
		DriverName string `json:"driver_name" doc:"Assigned Driver Name"`
	}
}
type ToggleDeliveryRunItemPickInput struct {
	ID     int64 `path:"id" doc:"Delivery Run ID"`
	ItemID int64 `path:"item_id" doc:"Delivery Run Item ID"`
	Body   struct {
		Picked bool `json:"picked" doc:"Picked status flag"`
	}
}

type DeleteDeliveryRunInput struct {
	ID int64 `path:"id" doc:"Delivery Run ID"`
}

func validateDeliveryRunPayload(run *model.DeliveryRun) error {
	run.DriverName = strings.TrimSpace(run.DriverName)
	if run.DriverName == "" {
		run.DriverName = "Unassigned"
	}
	run.DeliveryDate = strings.TrimSpace(run.DeliveryDate)
	if run.DeliveryDate == "" {
		return huma.Error400BadRequest("delivery date is required")
	}
	if len(run.Items) == 0 {
		return huma.Error400BadRequest("delivery run must contain at least one item")
	}
	for i := range run.Items {
		run.Items[i].NamaBarang = strings.TrimSpace(run.Items[i].NamaBarang)
		if run.Items[i].NamaBarang == "" {
			return huma.Error400BadRequest(fmt.Sprintf("item %d: nama_barang is required", i+1))
		}
		run.Items[i].PlannedQty = strings.TrimSpace(run.Items[i].PlannedQty)
		if run.Items[i].PlannedQty == "" {
			return huma.Error400BadRequest(fmt.Sprintf("item %d: planned_qty is required", i+1))
		}
	}
	return nil
}

func (s *Server) handleGetDeliveryRuns(ctx context.Context, input *GetDeliveryRunsInput) (*GetDeliveryRunsOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	filter := storage.DeliveryRunFilter{
		DeliveryDate: input.DeliveryDate,
		Status:       input.Status,
		DriverName:   input.DriverName,
		Area:         input.Area,
	}
	runs, err := s.store.GetDeliveryRuns(ctx, filter)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to get delivery runs", err)
	}
	out := &GetDeliveryRunsOutput{}
	out.Body.Runs = runs
	return out, nil
}

func (s *Server) handleGetDeliveryRunByID(ctx context.Context, input *GetDeliveryRunInput) (*GetDeliveryRunOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid delivery run id")
	}
	run, err := s.store.GetDeliveryRunByID(ctx, input.ID)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("delivery run %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to get delivery run", err)
	}
	out := &GetDeliveryRunOutput{}
	out.Body.Run = *run
	return out, nil
}

func (s *Server) handleCreateDeliveryRun(ctx context.Context, input *CreateDeliveryRunInput) (*CreateDeliveryRunOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	run := input.Body
	if err := validateDeliveryRunPayload(&run); err != nil {
		return nil, err
	}
	id, err := s.store.CreateDeliveryRun(ctx, run)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to create delivery run", err)
	}
	created, err := s.store.GetDeliveryRunByID(ctx, id)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to retrieve created delivery run", err)
	}

	out := &CreateDeliveryRunOutput{}
	out.Body.Status = "ok"
	out.Body.ID = id
	out.Body.Run = *created
	return out, nil
}

func (s *Server) handleUpdateDeliveryRun(ctx context.Context, input *UpdateDeliveryRunInput) (*UpdateDeliveryRunOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid delivery run id")
	}
	run := input.Body
	if err := validateDeliveryRunPayload(&run); err != nil {
		return nil, err
	}
	if err := s.store.UpdateDeliveryRun(ctx, input.ID, run); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("delivery run %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to update delivery run", err)
	}
	updated, err := s.store.GetDeliveryRunByID(ctx, input.ID)
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to retrieve updated delivery run", err)
	}

	out := &UpdateDeliveryRunOutput{}
	out.Body.Status = "ok"
	out.Body.Run = *updated
	return out, nil
}

func (s *Server) handleUpdateDeliveryRunStatus(ctx context.Context, input *UpdateDeliveryRunStatusInput) (*UpdateDeliveryRunOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid delivery run id")
	}
	cleanStatus := strings.ToUpper(strings.TrimSpace(input.Body.Status))
	switch cleanStatus {
	case "PLANNED", "PICKING", "READY", "DISPATCHED", "COMPLETED":
		// valid
	default:
		return nil, huma.Error400BadRequest("invalid status: must be PLANNED, PICKING, READY, DISPATCHED, or COMPLETED")
	}
	updated, err := s.store.UpdateDeliveryRunStatus(ctx, input.ID, cleanStatus)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("delivery run %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to update delivery run status", err)
	}

	out := &UpdateDeliveryRunOutput{}
	out.Body.Status = "ok"
	out.Body.Run = *updated
	return out, nil
}

func (s *Server) handleUpdateDeliveryRunDriver(ctx context.Context, input *UpdateDeliveryRunDriverInput) (*UpdateDeliveryRunOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid delivery run id")
	}
	driverName := strings.TrimSpace(input.Body.DriverName)
	if driverName == "" {
		driverName = "Unassigned"
	}
	updated, err := s.store.UpdateDeliveryRunDriver(ctx, input.ID, input.Body.DriverID, driverName)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("delivery run %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to update delivery run driver", err)
	}

	out := &UpdateDeliveryRunOutput{}
	out.Body.Status = "ok"
	out.Body.Run = *updated
	return out, nil
}

func (s *Server) handleToggleDeliveryRunItemPick(ctx context.Context, input *ToggleDeliveryRunItemPickInput) (*UpdateDeliveryRunOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 || input.ItemID <= 0 {
		return nil, huma.Error400BadRequest("invalid run or item id")
	}
	updated, err := s.store.ToggleDeliveryRunItemPicked(ctx, input.ID, input.ItemID, input.Body.Picked)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("delivery run item %d in run %d not found", input.ItemID, input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to toggle delivery run item pick", err)
	}

	out := &UpdateDeliveryRunOutput{}
	out.Body.Status = "ok"
	out.Body.Run = *updated
	return out, nil
}

func (s *Server) handleDeleteDeliveryRun(ctx context.Context, input *DeleteDeliveryRunInput) (*StatusOKOutput, error) {
	if s.store == nil {
		return nil, huma.Error503ServiceUnavailable("storage service not available")
	}
	if input.ID <= 0 {
		return nil, huma.Error400BadRequest("invalid delivery run id")
	}
	if err := s.store.DeleteDeliveryRun(ctx, input.ID); err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			return nil, huma.Error404NotFound(fmt.Sprintf("delivery run %d not found", input.ID))
		}
		return nil, huma.Error500InternalServerError("failed to delete delivery run", err)
	}
	return &StatusOKOutput{
		Body: StatusOKResponse{Status: "ok"},
	}, nil
}
