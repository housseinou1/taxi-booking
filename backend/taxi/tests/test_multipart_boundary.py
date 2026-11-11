from django.test import RequestFactory, SimpleTestCase

from taxi.middleware.multipart_boundary import (
    MultipartBoundaryRecoveryMiddleware,
    boundary_from_multipart_body,
)


class MultipartBoundaryRecoveryTests(SimpleTestCase):
    def test_reads_the_boundary_when_the_header_omits_it(self):
        boundary = "WebKitFormBoundaryYalaProfile"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="city"\r\n\r\n'
            "12\r\n"
            f"--{boundary}--\r\n"
        ).encode("ascii")
        request = RequestFactory().generic(
            "POST",
            "/auth/identity/update/",
            data=body,
            content_type="multipart/form-data",
        )

        recovered = MultipartBoundaryRecoveryMiddleware(lambda item: item)(request)

        self.assertIn(f"boundary={boundary}", recovered.META["CONTENT_TYPE"])
        self.assertEqual(recovered.POST["city"], "12")

    def test_ignores_a_header_that_already_has_a_boundary(self):
        body = b"--KeepMe\r\n\r\n\r\n--KeepMe--\r\n"
        self.assertEqual(boundary_from_multipart_body(body), "KeepMe")

    def test_rejects_a_boundary_that_could_break_the_header(self):
        self.assertEqual(boundary_from_multipart_body(b'--bad";\r\n'), "")
        self.assertEqual(boundary_from_multipart_body(b"not-multipart"), "")
