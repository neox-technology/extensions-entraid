namespace Neox.Extensions.EntraId;

public sealed record EntraConsentProblem(
    string Code,
    string Description,
    IReadOnlyList<string> Scopes,
    string? Claims,
    string? AdminConsentUrl);
