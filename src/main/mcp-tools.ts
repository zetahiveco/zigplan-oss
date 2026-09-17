import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import {
  addDocument,
  addEstimateLine,
  copyCostFromProject,
  createCostGroup,
  createCostItem,
  createProject,
  createTakeoffGroup,
  createTakeoffItem,
  createVendor,
  deleteTakeoffPaths,
  exportEstimateCsv,
  getEstimate,
  listCost,
  listDocuments,
  listProjects,
  listTakeoff,
  listTakeoffPaths,
  listVendors,
  removeCostGroup,
  removeCostItem,
  removeDocument,
  removeEstimateLine,
  removeTakeoffGroup,
  removeTakeoffItem,
  removeVendor,
  renameProject,
  updateCostGroup,
  updateCostItem,
  updateEstimateLine,
  updateTakeoffGroup,
  updateTakeoffItem,
  updateVendor
} from './pouch'

function ok(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

function fail(err: unknown): {
  content: Array<{ type: 'text'; text: string }>
  isError: true
} {
  const message = err instanceof Error ? err.message : String(err)
  return { content: [{ type: 'text', text: message }], isError: true }
}

export function registerZigplanMcpTools(server: McpServer): void {
  // —— Projects (no delete) ——
  server.tool('projects_list', 'List all Zigplan projects', {}, async () => {
    try {
      return ok(await listProjects())
    } catch (err) {
      return fail(err)
    }
  })

  server.tool(
    'projects_create',
    'Create a project',
    { name: z.string().describe('Project name') },
    async ({ name }) => {
      try {
        return ok(await createProject(name))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'projects_update',
    'Rename a project. Deleting projects via MCP is not allowed.',
    {
      id: z.string().describe('Project id'),
      name: z.string().describe('New project name')
    },
    async ({ id, name }) => {
      try {
        return ok(await renameProject(id, name))
      } catch (err) {
        return fail(err)
      }
    }
  )

  // —— Files / documents ——
  server.tool(
    'files_list',
    'List plan files for a project',
    { projectId: z.string() },
    async ({ projectId }) => {
      try {
        return ok(await listDocuments(projectId))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'files_add',
    'Add a plan file (PDF/PNG/JPEG/SVG) from base64 content',
    {
      projectId: z.string(),
      fileName: z.string(),
      fileType: z
        .enum(['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml'])
        .describe('MIME type'),
      dataBase64: z.string().describe('File bytes as base64')
    },
    async ({ projectId, fileName, fileType, dataBase64 }) => {
      try {
        const data = Buffer.from(dataBase64, 'base64')
        const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
        return ok(
          await addDocument({
            projectId,
            fileName,
            fileType,
            data: ab
          })
        )
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'files_remove',
    'Remove a plan file by document id',
    { id: z.string() },
    async ({ id }) => {
      try {
        await removeDocument(id)
        return ok({ removed: id })
      } catch (err) {
        return fail(err)
      }
    }
  )

  // —— Takeoff ——
  server.tool(
    'takeoff_list',
    'List takeoff groups and items for a project',
    { projectId: z.string() },
    async ({ projectId }) => {
      try {
        return ok(await listTakeoff(projectId))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_create_group',
    'Create a takeoff group',
    { projectId: z.string(), name: z.string() },
    async ({ projectId, name }) => {
      try {
        return ok(await createTakeoffGroup(projectId, name))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_update_group',
    'Rename a takeoff group',
    { id: z.string(), name: z.string() },
    async ({ id, name }) => {
      try {
        await updateTakeoffGroup(id, name)
        return ok({ id, name })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_remove_group',
    'Delete a takeoff group and its items',
    { id: z.string() },
    async ({ id }) => {
      try {
        await removeTakeoffGroup(id)
        return ok({ removed: id })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_create_item',
    'Create a takeoff item',
    {
      projectId: z.string(),
      groupId: z.string(),
      name: z.string(),
      quantity: z.number().optional()
    },
    async (payload) => {
      try {
        return ok(await createTakeoffItem(payload))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_update_item',
    'Update a takeoff item (name, quantity, dimensions, path, etc.)',
    {
      id: z.string(),
      name: z.string().optional(),
      quantity: z.number().optional(),
      length: z.number().nullable().optional(),
      breadth: z.number().nullable().optional(),
      height: z.number().nullable().optional(),
      area: z.number().nullable().optional(),
      color: z.string().nullable().optional(),
      path: z.unknown().optional(),
      countPaths: z.unknown().optional(),
      documentId: z.string().nullable().optional()
    },
    async ({ id, ...data }) => {
      try {
        await updateTakeoffItem(id, data)
        return ok({ id, updated: data })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_remove_item',
    'Delete a takeoff item',
    { id: z.string() },
    async ({ id }) => {
      try {
        await removeTakeoffItem(id)
        return ok({ removed: id })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_list_paths',
    'List all drawing path keys on a sheet (Select All equivalent). Keys look like item:{id}:{index} or tally:{id}:{index}.',
    {
      projectId: z.string(),
      sheetId: z.string().describe('Document or sheet id (PDF page 2+ uses docId::page::N)')
    },
    async ({ projectId, sheetId }) => {
      try {
        return ok(await listTakeoffPaths(projectId, sheetId))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_delete_paths',
    'Delete selected drawings by path keys (Delete Selected). Pass keys from takeoff_list_paths.',
    {
      projectId: z.string(),
      sheetId: z.string(),
      pathKeys: z.array(z.string()).describe('Overlay keys to remove')
    },
    async ({ projectId, sheetId, pathKeys }) => {
      try {
        return ok(await deleteTakeoffPaths(projectId, sheetId, pathKeys))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'takeoff_select_all_and_delete',
    'Select all drawings on a sheet and delete them in one step',
    {
      projectId: z.string(),
      sheetId: z.string()
    },
    async ({ projectId, sheetId }) => {
      try {
        const paths = await listTakeoffPaths(projectId, sheetId)
        const result = await deleteTakeoffPaths(
          projectId,
          sheetId,
          paths.map((p) => p.key)
        )
        return ok({ selected: paths.length, ...result })
      } catch (err) {
        return fail(err)
      }
    }
  )

  // —— Cost catalog ——
  server.tool(
    'cost_list',
    'List cost catalog groups and items for a project',
    { projectId: z.string() },
    async ({ projectId }) => {
      try {
        return ok(await listCost(projectId))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'cost_create_group',
    'Create a cost catalog group',
    {
      projectId: z.string(),
      name: z.string(),
      parentId: z.string().nullable().optional()
    },
    async (payload) => {
      try {
        return ok(await createCostGroup(payload))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'cost_update_group',
    'Rename a cost catalog group',
    { id: z.string(), name: z.string() },
    async ({ id, name }) => {
      try {
        await updateCostGroup(id, name)
        return ok({ id, name })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'cost_remove_group',
    'Delete a cost catalog group',
    { id: z.string() },
    async ({ id }) => {
      try {
        await removeCostGroup(id)
        return ok({ removed: id })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'cost_create_item',
    'Create a cost catalog item',
    {
      projectId: z.string(),
      name: z.string(),
      code: z.string(),
      quantity: z.number(),
      unit: z.string(),
      price: z.number(),
      groupId: z.string().nullable().optional(),
      vendorId: z.string().nullable().optional()
    },
    async (payload) => {
      try {
        return ok(await createCostItem(payload))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'cost_update_item',
    'Update a cost catalog item',
    {
      id: z.string(),
      name: z.string().optional(),
      code: z.string().optional(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      price: z.number().optional(),
      groupId: z.string().nullable().optional(),
      vendorId: z.string().nullable().optional()
    },
    async ({ id, ...data }) => {
      try {
        await updateCostItem(id, data)
        return ok({ id, updated: data })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'cost_remove_item',
    'Delete a cost catalog item',
    { id: z.string() },
    async ({ id }) => {
      try {
        await removeCostItem(id)
        return ok({ removed: id })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'cost_copy_from_project',
    'Copy cost catalog from one project into another',
    { fromProjectId: z.string(), toProjectId: z.string() },
    async ({ fromProjectId, toProjectId }) => {
      try {
        await copyCostFromProject(fromProjectId, toProjectId)
        return ok({ copied: true, fromProjectId, toProjectId })
      } catch (err) {
        return fail(err)
      }
    }
  )

  // —— Vendors ——
  server.tool('vendors_list', 'List vendors', {}, async () => {
    try {
      return ok(await listVendors())
    } catch (err) {
      return fail(err)
    }
  })

  server.tool(
    'vendors_create',
    'Create a vendor (name only; edit details with vendors_update)',
    { name: z.string() },
    async ({ name }) => {
      try {
        return ok(await createVendor(name))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'vendors_update',
    'Update vendor details',
    {
      id: z.string(),
      name: z.string().optional(),
      address: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      website: z.string().nullable().optional(),
      notes: z.string().nullable().optional()
    },
    async ({ id, ...data }) => {
      try {
        return ok(await updateVendor(id, data))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'vendors_remove',
    'Delete a vendor and clear it from cost items',
    { id: z.string() },
    async ({ id }) => {
      try {
        await removeVendor(id)
        return ok({ removed: id })
      } catch (err) {
        return fail(err)
      }
    }
  )

  // —— Estimates ——
  server.tool(
    'estimate_get',
    'Get estimate lines plus takeoff and cost catalog for a project',
    { projectId: z.string() },
    async ({ projectId }) => {
      try {
        return ok(await getEstimate(projectId))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'estimate_add_line',
    'Link a cost catalog item to a takeoff item with qty-per-takeoff factor',
    {
      projectId: z.string(),
      takeoffItemId: z.string(),
      costItemId: z.string(),
      quantityPerTakeoff: z.number()
    },
    async (payload) => {
      try {
        return ok(await addEstimateLine(payload))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'estimate_update_line',
    'Update an estimate line',
    {
      projectId: z.string(),
      lineId: z.string(),
      quantityPerTakeoff: z.number().optional(),
      costItemId: z.string().optional()
    },
    async ({ projectId, lineId, ...data }) => {
      try {
        return ok(await updateEstimateLine(projectId, lineId, data))
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'estimate_remove_line',
    'Remove an estimate line',
    { projectId: z.string(), lineId: z.string() },
    async ({ projectId, lineId }) => {
      try {
        await removeEstimateLine(projectId, lineId)
        return ok({ removed: lineId })
      } catch (err) {
        return fail(err)
      }
    }
  )

  server.tool(
    'estimate_export_csv',
    'Export the project estimate as CSV text (optionally write to a file path)',
    {
      projectId: z.string(),
      outputPath: z
        .string()
        .optional()
        .describe('If set, write CSV to this absolute or relative path')
    },
    async ({ projectId, outputPath }) => {
      try {
        const csv = await exportEstimateCsv(projectId)
        if (outputPath) {
          const filePath = resolve(outputPath)
          writeFileSync(filePath, csv, 'utf8')
          return ok({ written: filePath, bytes: Buffer.byteLength(csv, 'utf8') })
        }
        return { content: [{ type: 'text', text: csv }] }
      } catch (err) {
        return fail(err)
      }
    }
  )

}
