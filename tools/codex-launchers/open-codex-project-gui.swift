import AppKit
import Foundation

private let logURL = URL(fileURLWithPath: "/tmp/codex-project-picker.log")

private func log(_ message: String) {
    let line = "[\(ISO8601DateFormatter().string(from: Date()))] \(message)\n"
    let data = Data(line.utf8)
    if FileManager.default.fileExists(atPath: logURL.path) {
        if let handle = try? FileHandle(forWritingTo: logURL) {
            try? handle.seekToEnd()
            try? handle.write(contentsOf: data)
            try? handle.close()
        }
    } else {
        try? data.write(to: logURL)
    }
}

struct Target {
    let label: String
    let path: String
    let purpose: String

    var display: String {
        "\(label) — \(purpose)"
    }
}

struct Category {
    let name: String
    let prompt: String
    let tsvName: String
}

enum PickerError: LocalizedError {
    case missingResource(String)
    case invalidTSV(String)
    case codexAppMissing(String)

    var errorDescription: String? {
        switch self {
        case .missingResource(let message),
             .invalidTSV(let message),
             .codexAppMissing(let message):
            return message
        }
    }
}

final class PickerAppDelegate: NSObject, NSApplicationDelegate {
    private let categories: [Category] = [
        Category(name: "Active Worktrees", prompt: "Choose the worktree you want to open in Codex.", tsvName: "targets.tsv"),
        Category(name: "Linked Domains", prompt: "Choose the live domain line you want to route to a local Codex seat.", tsvName: "targets-domains.tsv"),
        Category(name: "Local-Only / Non-Vercel Projects", prompt: "Choose a local-only or non-Vercel project lane.", tsvName: "targets-local-only.tsv")
    ]

    private let codexAppURL = URL(fileURLWithPath: "/Applications/Codex.app")

    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.main.async {
            log("applicationDidFinishLaunching")
            NSApp.activate(ignoringOtherApps: true)
            self.runPicker()
        }
    }

    private func runPicker() {
        do {
            log("runPicker starting")
            guard let category = try chooseCategory() else {
                log("category selection cancelled")
                NSApp.terminate(nil)
                return
            }

            log("category selected: \(category.name)")
            guard let target = try chooseTarget(in: category) else {
                log("target selection cancelled")
                NSApp.terminate(nil)
                return
            }

            log("target selected: \(target.label) -> \(target.path)")
            try launchCodex(target: target)
        } catch {
            log("picker error: \(error.localizedDescription)")
            showError(error.localizedDescription)
            NSApp.terminate(nil)
        }
    }

    private func chooseCategory() throws -> Category? {
        let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 360, height: 28), pullsDown: false)
        categories.forEach { popup.addItem(withTitle: $0.name) }

        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "Codex Project Picker"
        alert.informativeText = "Choose a project category."
        alert.addButton(withTitle: "Open")
        alert.addButton(withTitle: "Cancel")
        alert.accessoryView = popup

        log("showing category picker")
        NSApp.activate(ignoringOtherApps: true)
        let response = alert.runModal()
        log("category picker response: \(response.rawValue)")
        guard response == .alertFirstButtonReturn else { return nil }
        return categories[popup.indexOfSelectedItem]
    }

    private func chooseTarget(in category: Category) throws -> Target? {
        let targets = try loadTargets(named: category.tsvName)
        guard !targets.isEmpty else {
            throw PickerError.invalidTSV("No launchable targets were found in \(category.tsvName).")
        }

        let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 560, height: 28), pullsDown: false)
        targets.forEach { popup.addItem(withTitle: $0.display) }

        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = category.name
        alert.informativeText = category.prompt
        alert.addButton(withTitle: "Open")
        alert.addButton(withTitle: "Back")
        alert.accessoryView = popup

        log("showing target picker for category: \(category.name)")
        NSApp.activate(ignoringOtherApps: true)
        let response = alert.runModal()
        log("target picker response: \(response.rawValue)")
        guard response == .alertFirstButtonReturn else { return nil }
        return targets[popup.indexOfSelectedItem]
    }

    private func loadTargets(named resourceName: String) throws -> [Target] {
        guard let existingPath = Bundle.main.resourceURL?.appendingPathComponent(resourceName).path else {
            throw PickerError.missingResource("Missing resource: \(resourceName)")
        }

        let contents = try String(contentsOfFile: existingPath, encoding: .utf8)
        var targets: [Target] = []

        for line in contents.split(whereSeparator: \.isNewline) {
            let text = String(line)
            if text.isEmpty || text.hasPrefix("#") { continue }
            let fields = text.components(separatedBy: "\t")
            if fields.count < 4 { continue }

            let target = Target(label: fields[1], path: fields[2], purpose: fields[3])
            targets.append(target)
        }

        return targets
    }

    private func launchCodex(target: Target) throws {
        let fm = FileManager.default
        guard fm.fileExists(atPath: codexAppURL.path) else {
            throw PickerError.codexAppMissing("Codex.app was not found at \(codexAppURL.path)")
        }

        let config = NSWorkspace.OpenConfiguration()
        config.activates = true
        log("launching Codex at path: \(target.path)")
        NSWorkspace.shared.open([URL(fileURLWithPath: target.path)], withApplicationAt: codexAppURL, configuration: config) { _, error in
            if let error {
                log("Codex launch failure: \(error.localizedDescription)")
                self.showError("Failed to open Codex: \(error.localizedDescription)")
            } else {
                log("Codex launch succeeded")
            }
            NSApp.terminate(nil)
        }
    }

    private func showError(_ message: String) {
        log("showError: \(message)")
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Codex Project Picker"
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = PickerAppDelegate()
app.setActivationPolicy(.regular)
app.delegate = delegate
app.run()
