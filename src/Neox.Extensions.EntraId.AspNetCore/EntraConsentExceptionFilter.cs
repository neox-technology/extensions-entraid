using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Neox.Extensions.EntraId;

public sealed class EntraConsentExceptionFilter : IExceptionFilter {

    public void OnException(ExceptionContext context) {
        ArgumentNullException.ThrowIfNull(context);

        if (!EntraConsentException.TryTranslate(context.Exception, out var problem)) {
            return;
        }

        context.Result = new ObjectResult(problem) {
            StatusCode = StatusCodes.Status401Unauthorized
        };
        context.ExceptionHandled = true;
    }
}
