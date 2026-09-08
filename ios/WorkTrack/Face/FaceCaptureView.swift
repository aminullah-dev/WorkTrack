import SwiftUI

/// Check in with your face, or enrol it the first time.
///
/// One screen for both, because they are the same act from the worker's side:
/// look at the phone. The difference is what the server does with the vector.
struct FaceCaptureView: View {
    enum Purpose: Identifiable {
        case enrol, verify
        var id: Self { self }
    }

    let purpose: Purpose
    let service: FaceService
    /// Called with the server's token once a face is verified; the punch that
    /// follows presents it as proof.
    let onVerified: (String) -> Void
    let onEnrolled: () -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var camera = CameraController()
    @State private var status: Status = .aiming
    @State private var isWorking = false

    private enum Status: Equatable {
        case aiming
        case checking
        /// Not a match, with how close it was — "come closer" is actionable,
        /// "not recognised" is not.
        case notRecognised(similarity: Double)
        case problem(String)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch camera.state {
            case .running:
                CameraPreview(session: camera.session).ignoresSafeArea()
                overlay
            case .denied:
                message(L.t("face_camera_denied"))
            case .unavailable:
                // The simulator, mostly. Deliberately NOT falling back to the
                // photo library: choosing an existing image would let one
                // worker check another in by photographing a photograph, and a
                // convenience for testing is not worth a hole in attendance.
                message(L.t("face_camera_unavailable"))
            case .idle:
                ProgressView().tint(.white)
            }
        }
        .task { await camera.start() }
        .onDisappear { camera.stop() }
    }

    private var overlay: some View {
        VStack {
            HStack {
                Button(L.t("common_close")) { dismiss() }
                    .foregroundStyle(.white)
                    .padding()
                Spacer()
            }
            Spacer()

            // A guide, not a crop: the detector finds the face wherever it is.
            // This is only to get somebody to hold the phone at arm's length
            // and face it, which is what makes the embedding stable.
            Ellipse()
                .strokeBorder(guideColor, lineWidth: 3)
                .frame(width: 240, height: 320)

            Spacer()
            Text(prompt)
                .font(.callout)
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
                .padding(.bottom, 12)

            Button {
                Task { await run() }
            } label: {
                ZStack {
                    Circle().fill(.white).frame(width: 74, height: 74)
                    if isWorking { ProgressView() }
                }
            }
            .disabled(isWorking)
            .padding(.bottom, 40)
        }
    }

    private var guideColor: Color {
        switch status {
        case .aiming, .checking: return .white
        case .notRecognised, .problem: return Palette.accent
        }
    }

    private var prompt: String {
        switch status {
        case .aiming:
            return L.t(purpose == .enrol ? "face_enrol_prompt" : "face_verify_prompt")
        case .checking:
            return L.t("face_checking")
        case .notRecognised:
            // The similarity is deliberately NOT shown. To a worker it is a
            // number he cannot act on, and to anyone else it is a hint about
            // how close somebody else's face is.
            return L.t("face_not_recognised")
        case .problem(let message):
            return message
        }
    }

    private func run() async {
        isWorking = true
        status = .checking
        defer { isWorking = false }

        do {
            let photo = try await camera.capture()
            switch purpose {
            case .enrol:
                _ = try await service.enrol(photo)
                onEnrolled()
                dismiss()
            case .verify:
                let result = try await service.verify(photo)
                if let token = result.token, result.match {
                    onVerified(token)
                    dismiss()
                } else {
                    status = .notRecognised(similarity: result.similarity)
                }
            }
        } catch FaceDetector.Failure.noFace {
            status = .problem(L.t("face_no_face"))
        } catch FaceDetector.Failure.tooManyFaces {
            status = .problem(L.t("face_many_faces"))
        } catch FaceDetector.Failure.tooSmall {
            status = .problem(L.t("face_too_far"))
        } catch ApiError.offline {
            // Face check needs the server: the enrolled vector lives there and
            // the token is signed there. Nothing to queue.
            status = .problem(L.t("face_needs_connection"))
        } catch ApiError.problem(_, let code, _) where code == "FACE_ALREADY_ENROLLED" {
            status = .problem(L.t("face_already_enrolled"))
        } catch {
            status = .problem(L.t("err_generic"))
        }
    }

    private func message(_ text: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill").font(.largeTitle)
            Text(text).multilineTextAlignment(.center)
            Button(L.t("common_close")) { dismiss() }.fontWeight(.semibold)
        }
        .foregroundStyle(.white)
        .padding(32)
    }
}
