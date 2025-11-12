/**
 * Web Worker for serializing conversations data
 * 
 * Purpose: Move heavy JSON parsing operations off the main thread
 * to prevent UI blocking, especially when dealing with large reasoning data.
 * 
 * Input: { conversationsJSON, projectsJSON, openIds, activeTabId, activeProjectId }
 *        (JSON strings to avoid postMessage cloning issues)
 * Output: { success: true, data: {...} } or { success: false, error: string }
 */

self.onmessage = function(e) {
  try {
    const { conversationsJSON, projectsJSON, openIds, activeTabId, activeProjectId } = e.data
    
    // Perform expensive JSON parsing in worker thread
    // Parse JSON strings that were sent to avoid cloning issues
    const conversations = JSON.parse(conversationsJSON)
    const projects = JSON.parse(projectsJSON)
    
    // The data is already plain objects after parsing, no need for additional stringify
    // Send back to main thread
    self.postMessage({
      success: true,
      data: {
        conversations: conversations,
        openIds: openIds,
        activeTabId: activeTabId,
        activeProjectId: activeProjectId,
        projects: projects
      }
    })
  } catch (error) {
    // Send error back to main thread
    self.postMessage({
      success: false,
      error: error.message || 'Serialization failed'
    })
  }
}
