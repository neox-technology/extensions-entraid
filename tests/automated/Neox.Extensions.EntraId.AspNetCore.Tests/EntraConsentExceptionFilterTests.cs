using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;

namespace Neox.Extensions.EntraId.AspNetCore.Tests;

public sealed class EntraConsentExceptionFilterTests {

    [Fact]
    public void OnException_LeavesUnknownExceptionUnhandled() {
        var context = CreateContext(new InvalidOperationException("other"));

        new EntraConsentExceptionFilter().OnException(context);

        Assert.False(context.ExceptionHandled);
        Assert.Null(context.Result);
    }

    [Fact]
    public void OnException_WritesUnauthorizedProblem() {
        var context = CreateContext(ConsentExceptionFactory.Ui("consent_required", "need consent"));

        new EntraConsentExceptionFilter().OnException(context);

        var result = Assert.IsType<ObjectResult>(context.Result);
        var problem = Assert.IsType<EntraConsentProblem>(result.Value);

        Assert.True(context.ExceptionHandled);
        Assert.Equal(StatusCodes.Status401Unauthorized, result.StatusCode);
        Assert.Equal("consent_required", problem.Code);
    }

    private static ExceptionContext CreateContext(Exception exception) {
        var action = new ActionContext(new DefaultHttpContext(), new RouteData(), new ActionDescriptor());

        return new ExceptionContext(action, []) {
            Exception = exception,
        };
    }
}
