using Microsoft.Identity.Client;

namespace Neox.Extensions.EntraId.AspNetCore.Tests;

public sealed class EntraConsentExceptionTests {

    [Theory]
    [InlineData("AADSTS65001", "consent_required")]
    [InlineData("AADSTS65004", "consent_denied")]
    [InlineData("AADSTS90094", "admin_consent_required")]
    public void TryTranslate_MapsAadstsCodes(string marker, string expected) {
        var exception = new InvalidOperationException($"Graph failed: {marker}");

        var translated = EntraConsentException.TryTranslate(exception, out var problem);

        Assert.True(translated);
        Assert.Equal(expected, problem.Code);
        Assert.Null(problem.Claims);
    }

    [Fact]
    public void TryTranslate_MapsLoginRequired() {
        var exception = new MsalServiceException("login_required", "session missing");

        var translated = EntraConsentException.TryTranslate(exception, out var problem);

        Assert.True(translated);
        Assert.Equal("interaction_required", problem.Code);
    }

    [Theory]
    [InlineData("access_denied", "consent_denied")]
    [InlineData("consent_required", "consent_required")]
    [InlineData("interaction_required", "interaction_required")]
    public void TryTranslate_MapsServiceErrorCode(string errorCode, string expected) {
        var exception = new MsalServiceException(errorCode, errorCode);

        var translated = EntraConsentException.TryTranslate(exception, out var problem);

        Assert.True(translated);
        Assert.Equal(expected, problem.Code);
    }

    [Fact]
    public void TryTranslate_PrefersClaimsOverDeniedCode() {
        var exception = ConsentExceptionFactory.Ui("access_denied", "AADSTS65004", "eyJjbGFpbXMiOiJ4In0");

        var translated = EntraConsentException.TryTranslate(exception, out var problem);

        Assert.True(translated);
        Assert.Equal("claims_challenge", problem.Code);
        Assert.Equal("eyJjbGFpbXMiOiJ4In0", problem.Claims);
    }

    [Fact]
    public void TryTranslate_ReadsScopesFromChallenge() {
        var inner = ConsentExceptionFactory.Ui("consent_required", "consent");
        var exception = ConsentExceptionFactory.Challenge(inner, "api://app/access_as_user");

        var translated = EntraConsentException.TryTranslate(exception, out var problem);

        Assert.True(translated);
        Assert.Equal("consent_required", problem.Code);
        Assert.Equal(["api://app/access_as_user"], problem.Scopes);
    }

    [Fact]
    public void TryTranslate_ReturnsFalseForUnknownException() {
        var translated = EntraConsentException.TryTranslate(new InvalidOperationException("other"), out _);

        Assert.False(translated);
    }

    [Fact]
    public void TryTranslate_UiRequiredWithoutClaimsIsInteractionRequired() {
        var exception = ConsentExceptionFactory.Ui("interaction_required", "login");

        var translated = EntraConsentException.TryTranslate(exception, out var problem);

        Assert.True(translated);
        Assert.Equal("interaction_required", problem.Code);
        Assert.Null(problem.Claims);
    }
}
