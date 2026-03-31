use std::process::Command;

fn cargo_run(args: &[&str]) -> std::process::Output {
    Command::new("cargo")
        .arg("run")
        .arg("--quiet")
        .arg("--")
        .args(args)
        .output()
        .expect("failed to execute cargo run")
}

fn temp_snapshot() -> String {
    let id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("/tmp/metacanon_cli_test_{id}.json")
}

#[test]
fn help_exits_zero_and_contains_metacanon() {
    let output = cargo_run(&["help"]);
    assert!(output.status.success(), "help should exit 0");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("MetaCanon") || stdout.contains("metacanon"),
        "help output should mention MetaCanon"
    );
}

#[test]
fn setup_creates_snapshot() {
    let snap = temp_snapshot();
    let output = cargo_run(&["setup", "--no-load-existing", "--snapshot", &snap]);
    assert!(output.status.success(), "setup should exit 0");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("review:") || stdout.contains("can_install"),
        "setup should print review info"
    );
    let _ = std::fs::remove_file(&snap);
}

#[test]
fn health_reports_providers() {
    let snap = temp_snapshot();
    cargo_run(&["setup", "--no-load-existing", "--snapshot", &snap]);
    let output = cargo_run(&["health", "--snapshot", &snap]);
    assert!(output.status.success(), "health should exit 0");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("healthy="),
        "health should report provider status"
    );
    let _ = std::fs::remove_file(&snap);
}

#[test]
fn system_check_reports_status() {
    let snap = temp_snapshot();
    cargo_run(&["setup", "--no-load-existing", "--snapshot", &snap]);
    let output = cargo_run(&["system-check", "--snapshot", &snap]);
    assert!(output.status.success(), "system-check should exit 0");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("status="),
        "system-check should report check statuses"
    );
    let _ = std::fs::remove_file(&snap);
}

#[test]
fn deliberate_returns_output() {
    let snap = temp_snapshot();
    cargo_run(&["setup", "--no-load-existing", "--snapshot", &snap]);
    let output = cargo_run(&["deliberate", "What is 2+2?", "--snapshot", &snap]);
    assert!(output.status.success(), "deliberate should exit 0");
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(
        stdout.contains("output=") || stdout.contains("Lens Outputs"),
        "deliberate should produce output"
    );
    let _ = std::fs::remove_file(&snap);
}

#[test]
fn sub_sphere_create_and_list() {
    let snap = temp_snapshot();
    cargo_run(&["setup", "--no-load-existing", "--snapshot", &snap]);
    let create_output = cargo_run(&[
        "sub-sphere-create",
        "--name",
        "cli-test",
        "--objective",
        "integration test",
        "--snapshot",
        &snap,
    ]);
    assert!(
        create_output.status.success(),
        "sub-sphere-create should exit 0"
    );
    let stdout = String::from_utf8_lossy(&create_output.stdout);
    assert!(
        stdout.contains("sub-sphere created"),
        "should confirm creation"
    );

    let list_output = cargo_run(&["sub-sphere-list", "--snapshot", &snap]);
    assert!(
        list_output.status.success(),
        "sub-sphere-list should exit 0"
    );
    let list_stdout = String::from_utf8_lossy(&list_output.stdout);
    assert!(
        list_stdout.contains("cli-test"),
        "list should include created sub-sphere"
    );
    let _ = std::fs::remove_file(&snap);
}

#[test]
fn snapshot_save_load_roundtrip() {
    let snap = temp_snapshot();
    cargo_run(&["setup", "--no-load-existing", "--snapshot", &snap]);
    cargo_run(&[
        "sub-sphere-create",
        "--name",
        "persist-test",
        "--objective",
        "test persistence",
        "--snapshot",
        &snap,
    ]);

    let save_output = cargo_run(&["snapshot-save", "--snapshot", &snap]);
    assert!(save_output.status.success(), "snapshot-save should exit 0");

    let load_output = cargo_run(&["snapshot-load", "--snapshot", &snap]);
    assert!(load_output.status.success(), "snapshot-load should exit 0");
    let stdout = String::from_utf8_lossy(&load_output.stdout);
    assert!(
        stdout.contains("sub_spheres=1"),
        "loaded snapshot should contain the sub-sphere"
    );
    let _ = std::fs::remove_file(&snap);
}

#[test]
fn unknown_command_fails() {
    let output = cargo_run(&["not-a-real-command"]);
    assert!(
        !output.status.success(),
        "unknown command should exit non-zero"
    );
}
