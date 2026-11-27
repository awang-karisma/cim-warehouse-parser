package api

import (
	"context"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/danielgtaylor/huma/v2"
)

// ListPurchaseOrdersInput defines query parameters for listing purchase order items.
type ListPurchaseOrdersInput struct {
	Q        string `query:"q" doc:"Search across nama_barang, pemasok, kode_barang, nie, keterangan, and catatan"`
	Supplier string `query:"supplier" doc:"Filter by exact supplier name"`
	Status   string `query:"status" doc:"Filter by status_order (__EMPTY__ or DIPESAN matches blank status)"`
	Type     string `query:"type" doc:"Filter by type: all, client, or stock"`
	From     string `query:"from" doc:"Filter tanggal >= YYYY-MM-DD"`
	To       string `query:"to" doc:"Filter tanggal <= YYYY-MM-DD"`
	Sort     string `query:"sort" doc:"Sort field: tanggal, pemasok, nama_barang, or status_order"`
	Order    string `query:"order" doc:"Sort direction: asc or desc"`
	Limit    int    `query:"limit" default:"50" minimum:"1" maximum:"500" doc:"Maximum number of items to return"`
	Offset   int    `query:"offset" default:"0" minimum:"0" doc:"Pagination offset"`
}

// ListPurchaseOrdersOutput wraps PurchaseOrderListResponse for Huma v2.
type ListPurchaseOrdersOutput struct {
	Body model.PurchaseOrderListResponse
}

func (s *Server) handleListPurchaseOrders(ctx context.Context, input *ListPurchaseOrdersInput) (*ListPurchaseOrdersOutput, error) {
	res, err := s.store.GetPurchaseOrderItems(ctx, model.PurchaseOrderFilter{
		Query:    input.Q,
		Supplier: input.Supplier,
		Status:   input.Status,
		Type:     input.Type,
		From:     input.From,
		To:       input.To,
		Sort:     input.Sort,
		Order:    input.Order,
		Limit:    input.Limit,
		Offset:   input.Offset,
	})
	if err != nil {
		return nil, huma.Error500InternalServerError("failed to list purchase orders", err)
	}
	return &ListPurchaseOrdersOutput{Body: *res}, nil
}
