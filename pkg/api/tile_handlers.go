package api

import (
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/awang-karisma/warehouse-parser/pkg/tilecache"
	"github.com/gofiber/fiber/v3"
)

func (s *Server) handleGetMapTile(c fiber.Ctx) error {
	if s.tileCache == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "map tile cache service not available"})
	}

	provider := strings.TrimSpace(c.Params("provider"))
	z, err := strconv.Atoi(strings.TrimSpace(c.Params("z")))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid zoom coordinate"})
	}
	x, err := strconv.Atoi(strings.TrimSpace(c.Params("x")))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid x coordinate"})
	}
	rawY := strings.TrimSuffix(strings.TrimSpace(c.Params("y")), ".png")
	y, err := strconv.Atoi(rawY)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid y coordinate"})
	}

	data, contentType, cacheStatus, err := s.tileCache.GetTile(c.Context(), provider, z, x, y)
	if err != nil {
		if errors.Is(err, tilecache.ErrInvalidTileRequest) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}
		if errors.Is(err, tilecache.ErrUpstreamUnavailable) {
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	c.Set("Content-Type", contentType)
	c.Set("X-Tile-Cache", cacheStatus)
	c.Set("Cache-Control", "private, max-age=300, stale-while-revalidate=86400")
	return c.Status(fiber.StatusOK).Send(data)
}

func (s *Server) handleInvalidateMapTileCache(c fiber.Ctx) error {
	if s.tileCache == nil {
		return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{"error": "map tile cache service not available"})
	}
	invalidatedAt, err := s.tileCache.Invalidate()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"status":         string(ResultOK),
		"invalidated_at": invalidatedAt.UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleGetMapTileConfig(c fiber.Ctx) error {
	cartoConfigured := s.tileCache != nil && s.tileCache.HasProviderKey("carto")
	osmConfigured := s.tileCache != nil && s.tileCache.HasProviderKey("osm")
	satelliteConfigured := s.tileCache != nil && s.tileCache.HasProviderKey("satellite")
	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"carto_api_key_configured":     cartoConfigured,
		"osm_api_key_configured":       osmConfigured,
		"satellite_api_key_configured": satelliteConfigured,
	})
}
