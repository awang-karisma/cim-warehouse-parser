// Package main provides the CLI entrypoint for the warehouse parser application.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/awang-karisma/warehouse-parser/pkg/model"
	"github.com/awang-karisma/warehouse-parser/pkg/parser"
	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
)

func main() {
	var (
		csvPath     = flag.String("csv", "", "Path to CSV file (e.g. testdata/orders_sample.csv)")
		sheetID     = flag.String("sheet-id", "1X3FqpqpP7utvkyFK98YE863ItVsvmmUrBTBsGfuzK3s", "Google Spreadsheet ID")
		sheetName   = flag.String("sheet-name", "PESANAN", "Google Sheet tab name")
		credentials = flag.String("credentials", "", "Path to Google Service Account JSON credentials file")
		apiKey      = flag.String("api-key", os.Getenv("GOOGLE_API_KEY"), "Google Cloud API Key for public sheets")
		format      = flag.String("format", "summary", "Output format: summary, json-orders, json-items")
		outPath     = flag.String("out", "", "Output file path (default stdout)")
	)
	flag.Parse()

	var (
		items  []model.NormalizedItem
		orders []model.Order
		err    error
	)

	switch {
	case *csvPath != "":
		items, orders, err = parser.ParseCSVFile(*csvPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error parsing CSV file: %v\n", err)
			os.Exit(1)
		}
	case *credentials != "":
		ctx := context.Background()
		svc, initErr := sheets.NewService(ctx,
			option.WithCredentialsFile(*credentials),
			option.WithScopes(sheets.SpreadsheetsReadonlyScope),
		)
		if initErr != nil {
			fmt.Fprintf(os.Stderr, "error initializing Google Sheets client: %v\n", initErr)
			os.Exit(1)
		}

		items, orders, err = parser.ParseSheet(ctx, svc, *sheetID, *sheetName)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error parsing Google Sheet: %v\n", err)
			os.Exit(1)
		}
	case *apiKey != "":
		ctx := context.Background()
		svc, initErr := sheets.NewService(ctx, option.WithAPIKey(*apiKey))
		if initErr != nil {
			fmt.Fprintf(os.Stderr, "error initializing Google Sheets client: %v\n", initErr)
			os.Exit(1)
		}

		items, orders, err = parser.ParseSheet(ctx, svc, *sheetID, *sheetName)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error parsing Google Sheet: %v\n", err)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "error: either -csv, -credentials, or -api-key must be provided\n\nUsage:\n")
		flag.PrintDefaults()
		os.Exit(1)
	}

	var outWriter io.Writer = os.Stdout
	if *outPath != "" {
		f, createErr := os.Create(*outPath)
		if createErr != nil {
			fmt.Fprintf(os.Stderr, "error creating output file %q: %v\n", *outPath, createErr)
			os.Exit(1)
		}
		defer f.Close()
		outWriter = f
	}

	switch strings.ToLower(*format) {
	case "summary":
		printSummary(outWriter, items, orders)
	case "json-orders":
		enc := json.NewEncoder(outWriter)
		enc.SetIndent("", "  ")
		if encodeErr := enc.Encode(orders); encodeErr != nil {
			fmt.Fprintf(os.Stderr, "error encoding orders JSON: %v\n", encodeErr)
			os.Exit(1)
		}
	case "json-items":
		enc := json.NewEncoder(outWriter)
		enc.SetIndent("", "  ")
		if encodeErr := enc.Encode(items); encodeErr != nil {
			fmt.Fprintf(os.Stderr, "error encoding items JSON: %v\n", encodeErr)
			os.Exit(1)
		}
	default:
		fmt.Fprintf(os.Stderr, "error: unknown format %q (allowed: summary, json-orders, json-items)\n", *format)
		os.Exit(1)
	}
}

func printSummary(w io.Writer, items []model.NormalizedItem, orders []model.Order) {
	customers := make(map[string]struct{})
	areas := make(map[string]struct{})
	statusCounts := make(map[string]int)

	var firstDate, lastDate string
	if len(items) > 0 {
		if !items[0].Tanggal.IsZero() {
			firstDate = items[0].Tanggal.Format("2006-01-02")
		}
		if !items[len(items)-1].Tanggal.IsZero() {
			lastDate = items[len(items)-1].Tanggal.Format("2006-01-02")
		}
	}

	for _, it := range items {
		if it.Customer != "" {
			customers[it.Customer] = struct{}{}
		}
		if it.Area != "" {
			areas[it.Area] = struct{}{}
		}
		if it.StatusOrder != "" {
			statusCounts[it.StatusOrder]++
		}
	}

	fmt.Fprintln(w, "================================================================================")
	fmt.Fprintln(w, "                      WAREHOUSE ORDER TRACKING SUMMARY                          ")
	fmt.Fprintln(w, "================================================================================")
	fmt.Fprintf(w, "Total Normalized Items : %d\n", len(items))
	fmt.Fprintf(w, "Total Grouped Orders   : %d\n", len(orders))
	fmt.Fprintf(w, "Unique Customers       : %d\n", len(customers))
	fmt.Fprintf(w, "Unique Areas           : %d\n", len(areas))
	if firstDate != "" || lastDate != "" {
		fmt.Fprintf(w, "Date Range             : %s - %s\n", firstDate, lastDate)
	}

	if len(statusCounts) > 0 {
		fmt.Fprintln(w, "\nOrder Status Breakdown:")
		for st, count := range statusCounts {
			fmt.Fprintf(w, "  - %-15s: %d\n", st, count)
		}
	}

	fmt.Fprintln(w, "\nSample Orders:")
	fmt.Fprintln(w, "--------------------------------------------------------------------------------")
	sampleLimit := min(len(orders), 5)
	for i := range sampleLimit {
		ord := orders[i]
		areaStr := ord.Area
		if areaStr == "" {
			areaStr = "-"
		}
		fmt.Fprintf(w, "[%s] Tanggal: %s | Customer: %s | Area: %s | Items: %d\n",
			ord.ID, ord.Tanggal, ord.Customer, areaStr, len(ord.Items))
		for _, itm := range ord.Items {
			fmt.Fprintf(w, "    - Row %d: %s (Qty: %s %s, Terkirim: %s, Belum: %s, Status: %s)\n",
				itm.RowIndex, itm.NamaBarang, itm.Jumlah, itm.Satuan,
				itm.JumlahTerkirim, itm.BelumTerkirim, itm.StatusOrder)
		}
	}
	if len(orders) > sampleLimit {
		fmt.Fprintf(w, "... and %d more orders.\n", len(orders)-sampleLimit)
	}
	fmt.Fprintln(w, "================================================================================")
}
