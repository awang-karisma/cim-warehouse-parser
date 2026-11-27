package parser

import (
	"context"
	"fmt"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/normalizer"
	gsheets "github.com/esome/google-sheets-parser"
	"google.golang.org/api/sheets/v4"
)

// ParsePurchaseOrderSheet fetches purchase order rows from the given Google Sheet,
// parses them into RawPurchaseOrderRow, and normalizes them with customer aliases.
func ParsePurchaseOrderSheet(ctx context.Context, svc *sheets.Service, spreadsheetID, sheetName string, aliases map[string]string) ([]model.PurchaseOrderItem, error) {
	if svc == nil {
		return nil, fmt.Errorf("sheets service is nil")
	}
	if spreadsheetID == "" {
		return nil, fmt.Errorf("spreadsheet ID cannot be empty")
	}
	if sheetName == "" {
		sheetName = "PERMINTAAN PEMBELIAN"
	}

	cfg := gsheets.MakeConfig(svc, spreadsheetID,
		gsheets.WithContext(ctx),
		gsheets.WithSheetName(sheetName),
		gsheets.WithAllowSkipColumns(true),
		gsheets.WithAllowSkipFields(true),
	)

	rawRows, err := gsheets.ParseSheetIntoStructSlice[model.RawPurchaseOrderRow](cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to parse purchase order sheet %q: %w", sheetName, err)
	}

	return normalizer.NormalizePurchaseOrderRows(rawRows, aliases), nil
}
